import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config, dbPath } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath());

// Bump and add a migration step below once there are installs to keep.
const SCHEMA_VERSION = 1;

// Cap the WAL file at 4 MB after checkpoints; it otherwise keeps its peak size (8 MB+ after a backfill).
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA journal_size_limit = 4194304;");

const startVersion = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
if (startVersion !== 0 && startVersion !== SCHEMA_VERSION) {
  throw new Error(`Database ${dbPath()} has schema version ${startVersion}, this build expects ${SCHEMA_VERSION}. Delete it and resync.`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT,
    password_hash TEXT,          -- Argon2id PHC string; NULL for Home Assistant users
    ha_user_id    TEXT UNIQUE,   -- set for users identified via HA ingress headers
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session (
    token_hash TEXT PRIMARY KEY, -- sha256 of the cookie value; the token itself is never stored
    user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  -- Garmin Personal API key, AES-256-GCM encrypted with the external master key.
  CREATE TABLE IF NOT EXISTS garmin_credential (
    user_id    INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS user_kv (
    user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    key     TEXT NOT NULL,
    value   TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  -- Verbatim API payloads for date-range endpoints, one row per fetched chunk.
  CREATE TABLE IF NOT EXISTS raw_range (
    user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    payload    BLOB NOT NULL, -- Brotli-compressed JSON (codec.ts)
    PRIMARY KEY (user_id, endpoint, start_date)
  );

  -- Every numeric field found in per-day payloads, flattened: e.g. "hrv.lastNightAvg".
  CREATE TABLE IF NOT EXISTS daily_metric (
    user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    date    TEXT NOT NULL,
    metric  TEXT NOT NULL,
    value   REAL NOT NULL,
    PRIMARY KEY (user_id, metric, date)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS activity (
    user_id     INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    id          INTEGER NOT NULL,
    start_local TEXT NOT NULL,
    type        TEXT,
    name        TEXT,
    summary     TEXT NOT NULL,
    detail      BLOB,          -- Brotli-compressed JSON
    fit_status  TEXT NOT NULL DEFAULT 'pending', -- pending | ok | error
    fit_error   TEXT,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS activity_start ON activity(user_id, start_local);

  -- Columnar per-second streams decoded from the FIT file.
  CREATE TABLE IF NOT EXISTS activity_stream (
    user_id     INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    streams     BLOB NOT NULL, -- delta-encoded, see codec.ts
    PRIMARY KEY (user_id, activity_id),
    FOREIGN KEY (user_id, activity_id) REFERENCES activity(user_id, id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    started  TEXT NOT NULL,
    finished TEXT,
    status   TEXT NOT NULL,
    message  TEXT
  );
`);

db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

/** Return freed pages to the OS and truncate the WAL; run after large writes (sync). */
export function compactStorage() {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

export function kvGet<T>(userId: number, key: string): T | null {
  const row = db.prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?").get(userId, key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function kvSet(userId: number, key: string, value: unknown) {
  db.prepare(
    "INSERT INTO user_kv(user_id, key, value) VALUES(?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
  ).run(userId, key, JSON.stringify(value));
}

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
