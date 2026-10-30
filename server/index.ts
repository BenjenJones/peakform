import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import {
  activityStreams,
  bestCurve,
  correlationMatrix,
  daySummary,
  decoupling,
  INSIGHT_METRICS,
  listActivities,
  meanMax,
  paired,
  readiness,
  trainingLoad,
} from "./analytics.js";
import { type AppEnv, authRoutes, requireUser, sameOrigin } from "./auth.js";
import { unpackJson } from "./codec.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { exchangeApiKey, forgetToken, GarminApiError } from "./garmin/client.js";
import { night } from "./night.js";
import { CURATED, metricSeries, resolveCurated } from "./normalize.js";
import { enqueueSync, syncAll, syncState } from "./sync.js";
import {
  changePassword,
  credentialInfo,
  deleteApiKey,
  deleteUser,
  purgeExpiredSessions,
  reencryptCredentials,
  storeApiKey,
  UserError,
} from "./users.js";

// HA Supervisor proxies ingress traffic from this address only.
const HA_INGRESS_PROXY = "172.30.32.2";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const app = new Hono();

if (config.isHaApp) {
  // Also what makes the X-Remote-User-* headers trustworthy: nobody else can reach us.
  app.use("*", async (c, next) => {
    const ip = getConnInfo(c).remote.address?.replace(/^::ffff:/, "");
    if (ip !== HA_INGRESS_PROXY) return c.text("Forbidden", 403);
    await next();
  });
}

app.use("*", secureHeaders({ crossOriginEmbedderPolicy: false }));
app.use("/api/*", sameOrigin, async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.route("/api/auth", authRoutes);

const api = new Hono<AppEnv>();
api.use("*", requireUser);

// ---------- Account ----------

api.get("/me", (c) => {
  const u = c.get("user");
  return c.json({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    mode: config.isHaApp ? "homeassistant" : "local",
    garminKey: credentialInfo(u.id), // never the key itself
  });
});

api.put("/me/garmin-key", async (c) => {
  const uid = c.get("user").id;
  const { apiKey } = await c.req.json<{ apiKey?: string }>();
  const key = String(apiKey ?? "").trim();
  if (!key || key.length > 1024 || /\s/.test(key)) return c.json({ error: "That does not look like an API key", code: "key_format" }, 400);
  // Validate against Garmin before storing anything.
  try {
    await exchangeApiKey(key);
  } catch (e) {
    const status = e instanceof GarminApiError ? e.status : 0;
    return status === 401 || status === 403
      ? c.json({ error: "Garmin rejected this key", code: "key_rejected" }, 400)
      : c.json({ error: `Could not verify key: ${(e as Error).message}`, code: "key_verify_failed" }, 502);
  }
  storeApiKey(uid, key);
  forgetToken(uid);
  enqueueSync(uid);
  return c.json({ ok: true });
});

api.delete("/me/garmin-key", (c) => {
  const uid = c.get("user").id;
  deleteApiKey(uid);
  forgetToken(uid);
  return c.json({ ok: true });
});

api.post("/me/password", async (c) => {
  if (config.isHaApp) return c.json({ error: "Managed by Home Assistant" }, 400);
  const { current, next } = await c.req.json<{ current?: string; next?: string }>();
  try {
    await changePassword(c.get("user").id, String(current ?? ""), String(next ?? ""));
    return c.json({ ok: true, loggedOut: true });
  } catch (e) {
    return c.json({ error: (e as Error).message, code: e instanceof UserError ? e.code : undefined }, 400);
  }
});

/** Deletes the account and, via ON DELETE CASCADE, every row of Garmin data. */
api.delete("/me", (c) => {
  const uid = c.get("user").id;
  forgetToken(uid);
  deleteUser(uid);
  return c.json({ ok: true });
});

// ---------- Sync ----------

api.get("/status", (c) => {
  const uid = c.get("user").id;
  const count = (sql: string) => (db.prepare(sql).get(uid) as { n: number }).n;
  return c.json({
    configured: credentialInfo(uid) !== null,
    sync: syncState(uid),
    intervalMinutes: config.syncIntervalMinutes,
    counts: {
      days: count("SELECT count(DISTINCT date) AS n FROM daily_metric WHERE user_id = ?"),
      metrics: count("SELECT count(DISTINCT metric) AS n FROM daily_metric WHERE user_id = ?"),
      activities: count("SELECT count(*) AS n FROM activity WHERE user_id = ?"),
      fitPending: count("SELECT count(*) AS n FROM activity WHERE user_id = ? AND fit_status = 'pending'"),
      fitErrors: count("SELECT count(*) AS n FROM activity WHERE user_id = ? AND fit_status = 'error'"),
    },
    lastSyncs: db.prepare("SELECT started, finished, status, message FROM sync_log WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(uid),
  });
});

api.post("/sync", (c) => {
  const uid = c.get("user").id;
  if (!credentialInfo(uid)) return c.json({ error: "No API key stored" }, 400);
  enqueueSync(uid);
  return c.json({ started: true });
});

// ---------- Data ----------

api.get("/metrics", (c) => {
  const uid = c.get("user").id;
  const raw = db
    .prepare("SELECT metric, count(*) AS n, min(date) AS first, max(date) AS last FROM daily_metric WHERE user_id = ? GROUP BY metric ORDER BY metric")
    .all(uid);
  const curated = Object.entries(CURATED).map(([key, def]) => ({ key, ...def, resolved: resolveCurated(uid, key) }));
  return c.json({ curated, raw, insight: INSIGHT_METRICS });
});

api.get("/series", (c) => {
  const uid = c.get("user").id;
  const keys = (c.req.query("keys") ?? "").split(",").filter(Boolean);
  const from = c.req.query("from") ?? daysAgo(90);
  const to = c.req.query("to") ?? today();
  return c.json(Object.fromEntries(keys.map((k) => [k, metricSeries(uid, k, from, to)])));
});

api.get("/load", (c) => c.json(trainingLoad(c.get("user").id, c.req.query("from") ?? daysAgo(180), c.req.query("to") ?? today())));

api.get("/readiness", (c) => c.json(readiness(c.get("user").id, c.req.query("date") ?? today())));

api.get("/day", (c) => {
  const date = c.req.query("date") ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  return c.json(daySummary(c.get("user").id, date));
});

api.get("/night", async (c) => {
  const date = c.req.query("date") ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  return c.json(await night(c.get("user").id, date));
});

api.get("/activities", (c) => c.json(listActivities(c.get("user").id, c.req.query("from") ?? daysAgo(90), c.req.query("to") ?? today())));

api.get("/activities/:id", (c) => {
  const uid = c.get("user").id;
  const id = Number(c.req.param("id"));
  const row = db.prepare("SELECT * FROM activity WHERE user_id = ? AND id = ?").get(uid, id) as Record<string, string | null> & { detail: Uint8Array | null; summary: string } | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  const streams = activityStreams(uid, id);
  return c.json({
    id,
    type: row.type,
    name: row.name,
    start: row.start_local,
    fitStatus: row.fit_status,
    fitError: row.fit_error,
    summary: JSON.parse(row.summary),
    detail: row.detail ? unpackJson(row.detail) : null,
    streams,
    curves: streams
      ? { power: meanMax(streams, "power"), speed: meanMax(streams, "speed"), hr: meanMax(streams, "hr") }
      : null,
    decouplingPct: streams ? decoupling(streams) : null,
  });
});

api.get("/curve", (c) => {
  const field = (c.req.query("field") ?? "power") as "power" | "speed" | "hr";
  return c.json(bestCurve(c.get("user").id, c.req.query("from") ?? daysAgo(90), c.req.query("to") ?? today(), field, c.req.query("type")));
});

api.get("/correlations", (c) =>
  c.json(
    correlationMatrix(c.get("user").id, c.req.query("from") ?? daysAgo(180), c.req.query("to") ?? today(), Number(c.req.query("lag") ?? 1)),
  ),
);

api.get("/scatter", (c) => {
  const { x, y } = c.req.query();
  if (!x || !y) return c.json({ error: "x and y required" }, 400);
  return c.json(paired(c.get("user").id, x, y, c.req.query("from") ?? daysAgo(180), c.req.query("to") ?? today(), Number(c.req.query("lag") ?? 0)));
});

/** Latest raw payload per endpoint, for mapping fields while Garmin's schemas are undocumented. */
api.get("/raw/:endpoint", (c) => {
  const row = db
    .prepare("SELECT start_date, end_date, fetched_at, payload FROM raw_range WHERE user_id = ? AND endpoint = ? ORDER BY start_date DESC LIMIT 1")
    .get(c.get("user").id, c.req.param("endpoint")) as { start_date: string; end_date: string; fetched_at: string; payload: Uint8Array } | undefined;
  return row ? c.json({ ...row, payload: unpackJson(row.payload) }) : c.json({ error: "no data" }, 404);
});

app.route("/api", api);

// SPA: built with relative asset URLs so it works under HA's dynamic ingress prefix.
app.use("/*", serveStatic({ root: "./dist/web" }));
const indexHtml = (() => {
  try {
    return readFileSync("./dist/web/index.html", "utf8");
  } catch {
    return "<p>Frontend not built. Run <code>npm run dev</code> or <code>npm run build</code>.</p>";
  }
})();
app.get("*", (c) => c.html(indexHtml));

reencryptCredentials();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`peakform listening on :${info.port} (${config.isHaApp ? "Home Assistant" : "standalone"})`);
});

syncAll();
setInterval(() => {
  purgeExpiredSessions();
  syncAll();
}, config.syncIntervalMinutes * 60_000);
