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
  /**
   * Standalone only: address the app is reached at, e.g. https://peakform.example.org. Links in
   * mails are built from it, never from the request's Host header (which an attacker controls).
   */
  publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/+$/, ""),
  /** Standalone only: outgoing mail for password resets. */
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT || 587),
    /** true: TLS from the start (port 465); false: STARTTLS when the server offers it. */
    secure: process.env.SMTP_SECURE === "true",
    /** Refuse to send without encryption; only turn off for a relay on the same host or network. */
    requireTls: process.env.SMTP_REQUIRE_TLS !== "false",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "",
  },
};

/** Password reset by mail needs a mail server and the public address for the link. */
export const mailEnabled = () => !config.isHaApp && !!config.smtp.host && !!config.smtp.from && !!config.publicUrl;

export const dbPath = () => join(config.dataDir, "garmin.sqlite");
