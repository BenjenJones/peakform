import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Home Assistant apps receive user options in /data/options.json.
// Outside HA, fall back to environment variables.
const HA_OPTIONS = "/data/options.json";

interface HaOptions {
  master_key?: string;
  backfill_days?: number;
  sync_interval_minutes?: number;
}

const ha: HaOptions | null = existsSync(HA_OPTIONS)
  ? JSON.parse(readFileSync(HA_OPTIONS, "utf8"))
  : null;

export const config = {
  isHaApp: ha !== null,
  masterKey: ha?.master_key || process.env.MASTER_KEY || "",
  baseUrl: process.env.GARMIN_PERSONAL_API_BASE_URL || "https://personal.connectapi.garmin.com",
  dataDir: ha ? "/data" : process.env.DATA_DIR || "./data",
  port: Number(process.env.PORT || 8099),
  backfillDays: ha?.backfill_days ?? Number(process.env.BACKFILL_DAYS || 365),
  syncIntervalMinutes: ha?.sync_interval_minutes ?? Number(process.env.SYNC_INTERVAL_MINUTES || 60),
  /** Standalone only: whether anyone reaching the page can create an account. */
  allowRegistration: (process.env.ALLOW_REGISTRATION ?? "true") !== "false",
  /** Standalone only: honor X-Forwarded-For / X-Forwarded-Proto from a reverse proxy. */
  trustProxy: process.env.TRUST_PROXY === "true",
  sessionDays: 30,
};

export const dbPath = () => join(config.dataDir, "garmin.sqlite");
