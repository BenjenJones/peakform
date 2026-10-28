import { argon2, createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";

const argon2Async = promisify(argon2);

// ---------- Passwords: Argon2id, PHC string format ----------

// OWASP minimum recommendation for Argon2id: 19 MiB, 2 passes, 1 lane.
const ARGON = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

async function argonHash(password: string, salt: Buffer, p = ARGON) {
  return argon2Async("argon2id", { message: password, nonce: salt, ...p });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argonHash(password, salt);
  const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");
  return `$argon2id$v=19$m=${ARGON.memory},t=${ARGON.passes},p=${ARGON.parallelism}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(phc);
  if (!m) return false;
  const expected = Buffer.from(m[5], "base64");
  const actual = await argonHash(password, Buffer.from(m[4], "base64"), {
    memory: Number(m[1]),
    passes: Number(m[2]),
    parallelism: Number(m[3]),
    tagLength: expected.length,
  });
  return timingSafeEqual(actual, expected);
}

/** Burn the same time as a real verify, so unknown usernames are not distinguishable by timing. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));
export async function verifyDummy(password: string) {
  await verifyPassword(password, await DUMMY_HASH);
  return false;
}

// ---------- Session tokens ----------

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ---------- Secrets at rest: AES-256-GCM envelope with an external master key ----------

interface MasterKey {
  id: string;
  key: Buffer;
}

function parseKey(raw: string, source: string): Buffer {
  const s = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
  if (key.length !== 32) throw new Error(`${source}: master key must be 32 bytes (base64 or hex), got ${key.length}`);
  return key;
}

const toMaster = (key: Buffer): MasterKey => ({ id: createHash("sha256").update(key).digest("hex").slice(0, 8), key });

function loadMasterKeys(): { current: MasterKey; all: Map<string, MasterKey> } {
  let current: Buffer;
  if (config.masterKey) {
    current = parseKey(config.masterKey, "MASTER_KEY");
  } else if (process.env.MASTER_KEY_FILE) {
    current = parseKey(readFileSync(process.env.MASTER_KEY_FILE, "utf8"), "MASTER_KEY_FILE");
  } else {
    // Fallback: generated key file next to the DB. Protects against a leaked DB file,
    // not against a leaked data directory or unencrypted backup of it.
    const file = join(config.dataDir, "master.key");
    mkdirSync(config.dataDir, { recursive: true });
    if (!existsSync(file)) {
      writeFileSync(file, randomBytes(32).toString("base64") + "\n", { mode: 0o600 });
      console.warn(`Generated master key at ${file}. Set MASTER_KEY (or MASTER_KEY_FILE) to keep it outside the data directory.`);
    }
    try {
      chmodSync(file, 0o600);
    } catch {}
    current = parseKey(readFileSync(file, "utf8"), file);
  }
  const all = new Map<string, MasterKey>();
  const cur = toMaster(current);
  all.set(cur.id, cur);
  // Rotation: set MASTER_KEY to the new key and MASTER_KEY_PREVIOUS to the old one;
  // credentials are re-encrypted with the new key on startup.
  if (process.env.MASTER_KEY_PREVIOUS) {
    const prev = toMaster(parseKey(process.env.MASTER_KEY_PREVIOUS, "MASTER_KEY_PREVIOUS"));
    all.set(prev.id, prev);
  }
  return { current: cur, all };
}

const keys = loadMasterKeys();

/**
 * Format: v1.<keyId>.<iv>.<ciphertext+tag>, base64url parts.
 * `context` is bound as AAD (e.g. "garmin-api-key:user:42"), so a ciphertext copied
 * to another user's row fails to decrypt.
 */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.current.key, iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return ["v1", keys.current.id, iv.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, context: string): string {
  const [version, keyId, ivB64, ctB64] = blob.split(".");
  if (version !== "v1") throw new Error(`Unknown secret format ${version}`);
  const mk = keys.all.get(keyId);
  if (!mk) throw new Error(`Secret was encrypted with unknown master key ${keyId}`);
  const data = Buffer.from(ctB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", mk.key, Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}

export const needsReencrypt = (blob: string) => blob.split(".")[1] !== keys.current.id;
