import { config } from "./config.js";
import { decryptSecret, encryptSecret, hashPassword, needsReencrypt, newToken, sha256, verifyDummy, verifyPassword } from "./crypto.js";
import { db } from "./db.js";

export interface User {
  id: number;
  username: string;
  display_name: string | null;
  ha_user_id: string | null;
}

/** Error with a stable code the frontend can translate. */
export class UserError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 10;

const now = () => new Date().toISOString();
const USER_COLS = "id, username, display_name, ha_user_id";

export function getUser(id: number): User | null {
  return (db.prepare(`SELECT ${USER_COLS} FROM user WHERE id = ?`).get(id) as unknown as User) ?? null;
}

// ---------- Local accounts ----------

export async function register(username: string, password: string): Promise<User> {
  if (!USERNAME_RE.test(username)) throw new UserError("username_invalid", "Username: 3–32 characters, letters, digits, . _ -");
  if (username.toLowerCase().startsWith("ha.")) throw new UserError("username_reserved", 'Usernames starting with "ha." are reserved');
  if (password.length < MIN_PASSWORD) throw new UserError("password_too_short", `Password must be at least ${MIN_PASSWORD} characters`);
  const hash = await hashPassword(password);
  try {
    const r = db.prepare("INSERT INTO user(username, password_hash, created_at) VALUES(?, ?, ?)").run(username, hash, now());
    return getUser(Number(r.lastInsertRowid))!;
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new UserError("username_taken", "Username is taken");
    throw e;
  }
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  const row = db.prepare("SELECT id, password_hash FROM user WHERE username = ?").get(username) as
    | { id: number; password_hash: string | null }
    | undefined;
  if (!row?.password_hash) return verifyDummy(password).then(() => null);
  return (await verifyPassword(password, row.password_hash)) ? getUser(row.id) : null;
}

export async function changePassword(userId: number, current: string, next: string) {
  const row = db.prepare("SELECT password_hash FROM user WHERE id = ?").get(userId) as { password_hash: string | null };
  if (!row.password_hash || !(await verifyPassword(current, row.password_hash))) throw new UserError("wrong_current_password", "Current password is wrong");
  if (next.length < MIN_PASSWORD) throw new UserError("password_too_short", `Password must be at least ${MIN_PASSWORD} characters`);
  db.prepare("UPDATE user SET password_hash = ? WHERE id = ?").run(await hashPassword(next), userId);
  // Log out every other session.
  db.prepare("DELETE FROM session WHERE user_id = ?").run(userId);
}

export const deleteUser = (userId: number) => db.prepare("DELETE FROM user WHERE id = ?").run(userId);

// ---------- Home Assistant users (identity from ingress headers) ----------

export function upsertHaUser(haUserId: string, name: string, displayName: string | null): User {
  const existing = db.prepare(`SELECT ${USER_COLS} FROM user WHERE ha_user_id = ?`).get(haUserId) as unknown as User | undefined;
  if (existing) {
    if (existing.display_name !== displayName) db.prepare("UPDATE user SET display_name = ? WHERE id = ?").run(displayName, existing.id);
    return existing;
  }
  // "ha." prefix is reserved for HA users; fall back to the HA id if the name is unusable or taken.
  const insert = db.prepare("INSERT INTO user(username, display_name, ha_user_id, created_at) VALUES(?, ?, ?, ?)");
  const byId = `ha.${haUserId.slice(0, 12)}`;
  let r;
  try {
    r = insert.run(USERNAME_RE.test(name) ? `ha.${name}` : byId, displayName, haUserId, now());
  } catch {
    r = insert.run(byId, displayName, haUserId, now());
  }
  return getUser(Number(r.lastInsertRowid))!;
}

// ---------- Sessions ----------

export function createSession(userId: number): string {
  const token = newToken();
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000).toISOString();
  db.prepare("INSERT INTO session(token_hash, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)").run(sha256(token), userId, now(), expires);
  return token;
}

export function sessionUser(token: string): User | null {
  const row = db.prepare("SELECT user_id, expires_at FROM session WHERE token_hash = ?").get(sha256(token)) as
    | { user_id: number; expires_at: string }
    | undefined;
  if (!row) return null;
  if (row.expires_at < now()) {
    destroySession(token);
    return null;
  }
  return getUser(row.user_id);
}

export const destroySession = (token: string) => db.prepare("DELETE FROM session WHERE token_hash = ?").run(sha256(token));
export const purgeExpiredSessions = () => db.prepare("DELETE FROM session WHERE expires_at < ?").run(now());

// ---------- Garmin API key (encrypted at rest) ----------

const keyContext = (userId: number) => `garmin-api-key:user:${userId}`;

export function storeApiKey(userId: number, apiKey: string) {
  db.prepare(
    `INSERT INTO garmin_credential(user_id, ciphertext, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at, last_error = NULL`,
  ).run(userId, encryptSecret(apiKey, keyContext(userId)), now());
}

export function loadApiKey(userId: number): string | null {
  const row = db.prepare("SELECT ciphertext FROM garmin_credential WHERE user_id = ?").get(userId) as { ciphertext: string } | undefined;
  return row ? decryptSecret(row.ciphertext, keyContext(userId)) : null;
}

export const deleteApiKey = (userId: number) => db.prepare("DELETE FROM garmin_credential WHERE user_id = ?").run(userId);

export function credentialInfo(userId: number) {
  return (
    (db.prepare("SELECT updated_at, last_error FROM garmin_credential WHERE user_id = ?").get(userId) as
      | { updated_at: string; last_error: string | null }
      | undefined) ?? null
  );
}

export const setCredentialError = (userId: number, error: string | null) =>
  db.prepare("UPDATE garmin_credential SET last_error = ? WHERE user_id = ?").run(error, userId);

export const usersWithKeys = () =>
  (db.prepare("SELECT user_id FROM garmin_credential").all() as { user_id: number }[]).map((r) => r.user_id);

/** After a master-key rotation, re-encrypt every credential with the current key. */
export function reencryptCredentials() {
  const rows = db.prepare("SELECT user_id, ciphertext FROM garmin_credential").all() as { user_id: number; ciphertext: string }[];
  let n = 0;
  for (const r of rows) {
    if (!needsReencrypt(r.ciphertext)) continue;
    try {
      storeApiKey(r.user_id, decryptSecret(r.ciphertext, keyContext(r.user_id)));
      n++;
    } catch (e) {
      console.error(`Cannot decrypt Garmin key of user ${r.user_id}: ${(e as Error).message}`);
    }
  }
  if (n) console.log(`Re-encrypted ${n} Garmin API key(s) with the current master key`);
}
