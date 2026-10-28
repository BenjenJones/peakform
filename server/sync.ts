import { encodeStreams, packJson } from "./codec.js";
import { config } from "./config.js";
import { compactStorage, db, kvGet, kvSet } from "./db.js";
import { GarminApiError, GarminClient } from "./garmin/client.js";
import { activityDetail, activityDownload, activitySearch, rangeEndpoints, singleEndpoints } from "./garmin/endpoints.js";
import { parseFit } from "./garmin/fit.js";
import { rebuildDailyMetrics } from "./normalize.js";
import { loadApiKey, setCredentialError, usersWithKeys } from "./users.js";

/** Days refetched on every sync, since today's/yesterday's data keeps changing. */
const OVERLAP_DAYS = 3;
const ACTIVITY_PAGE = 100;
/** FIT downloads per run, so a big backfill spreads over several syncs. */
const MAX_FIT_PER_RUN = 150;

export interface SyncState {
  running: boolean;
  queued: boolean;
  step: string;
  lastRun: { started: string; finished: string; status: string; message: string | null } | null;
  errors: string[];
}

const states = new Map<number, SyncState>();
export function syncState(userId: number): SyncState {
  let s = states.get(userId);
  if (!s) states.set(userId, (s = { running: false, queued: false, step: "", lastRun: null, errors: [] }));
  return s;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
const minDay = (a: string, b: string) => (a < b ? a : b);

async function syncRanges(uid: number, client: GarminClient, state: SyncState) {
  const today = isoDay(new Date());
  const upsert = db.prepare(
    `INSERT INTO raw_range(user_id, endpoint, start_date, end_date, fetched_at, payload) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, endpoint, start_date) DO UPDATE SET end_date = excluded.end_date, fetched_at = excluded.fetched_at, payload = excluded.payload`,
  );

  for (const ep of rangeEndpoints) {
    const cursor = kvGet<string>(uid, `cursor:${ep.key}`);
    let start = cursor ? addDays(cursor, -OVERLAP_DAYS) : addDays(today, -config.backfillDays);
    try {
      while (start <= today) {
        const end = minDay(addDays(start, ep.chunkDays - 1), today);
        state.step = `${ep.key} ${start} → ${end}`;
        const { path, params } = ep.build(start, end);
        const payload = await client.get(path, params);
        upsert.run(uid, ep.key, start, end, new Date().toISOString(), packJson(payload));
        kvSet(uid, `cursor:${ep.key}`, end);
        start = addDays(end, 1);
      }
    } catch (e) {
      if (e instanceof GarminApiError && e.path.includes("token")) throw e;
      state.errors.push(`${ep.key}: ${(e as Error).message}`);
    }
  }
}

interface ActivitySummary {
  activityId: number;
  startTimeLocal: string;
  activityName?: string;
  activityType?: { typeKey?: string };
}

async function syncActivities(uid: number, client: GarminClient, state: SyncState) {
  const latest = db.prepare("SELECT max(start_local) AS d FROM activity WHERE user_id = ?").get(uid) as { d: string | null };
  const startDate = latest.d ? addDays(latest.d.slice(0, 10), -OVERLAP_DAYS) : addDays(isoDay(new Date()), -config.backfillDays);
  const upsert = db.prepare(
    `INSERT INTO activity(user_id, id, start_local, type, name, summary) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, type = excluded.type, summary = excluded.summary`,
  );

  for (let offset = 0; ; offset += ACTIVITY_PAGE) {
    state.step = `activities from ${startDate} (+${offset})`;
    const page = await client.get<ActivitySummary[]>(activitySearch, {
      start: offset,
      limit: ACTIVITY_PAGE,
      startDate,
      endDate: isoDay(new Date()),
    });
    if (!Array.isArray(page) || page.length === 0) break;
    for (const a of page) {
      upsert.run(uid, a.activityId, a.startTimeLocal, a.activityType?.typeKey ?? null, a.activityName ?? null, JSON.stringify(a));
    }
    if (page.length < ACTIVITY_PAGE) break;
  }

  const pending = db
    .prepare("SELECT id FROM activity WHERE user_id = ? AND fit_status = 'pending' ORDER BY start_local DESC LIMIT ?")
    .all(uid, MAX_FIT_PER_RUN) as { id: number }[];
  const saveStream = db.prepare(
    `INSERT INTO activity_stream(user_id, activity_id, streams) VALUES(?, ?, ?)
     ON CONFLICT(user_id, activity_id) DO UPDATE SET streams = excluded.streams`,
  );
  const markOk = db.prepare("UPDATE activity SET fit_status = 'ok', fit_error = NULL, detail = ? WHERE user_id = ? AND id = ?");
  const markErr = db.prepare("UPDATE activity SET fit_status = 'error', fit_error = ? WHERE user_id = ? AND id = ?");

  for (const [i, { id }] of pending.entries()) {
    state.step = `FIT ${i + 1}/${pending.length} (activity ${id})`;
    try {
      const detail = await client.get(activityDetail(id));
      const fit = parseFit(await client.download(activityDownload(id)));
      saveStream.run(uid, id, encodeStreams(fit.streams));
      markOk.run(packJson({ detail, laps: fit.laps, session: fit.session }), uid, id);
    } catch (e) {
      markErr.run((e as Error).message, uid, id);
    }
  }
}

async function syncUser(uid: number): Promise<void> {
  const state = syncState(uid);
  state.running = true;
  state.queued = false;
  state.errors = [];
  const started = new Date().toISOString();
  const log = db.prepare("INSERT INTO sync_log(user_id, started, status) VALUES(?, ?, 'running')").run(uid, started);
  let status = "ok";
  let message: string | null = null;

  try {
    const apiKey = loadApiKey(uid);
    if (!apiKey) throw new Error("No Garmin API key stored");
    const client = new GarminClient(uid, apiKey);
    state.step = "profile";
    for (const [key, path] of Object.entries(singleEndpoints)) {
      try {
        kvSet(uid, `single:${key}`, await client.get(path));
      } catch (e) {
        if (e instanceof GarminApiError && e.path.includes("token")) throw e;
        state.errors.push(`${key}: ${(e as Error).message}`);
      }
    }
    await syncRanges(uid, client, state);
    try {
      await syncActivities(uid, client, state);
    } catch (e) {
      if (e instanceof GarminApiError && e.path.includes("token")) throw e;
      state.errors.push(`activities: ${(e as Error).message}`);
    }
    state.step = "normalizing";
    rebuildDailyMetrics(uid);
    compactStorage();
    setCredentialError(uid, null);
    if (state.errors.length) {
      status = "partial";
      message = state.errors.join("\n");
    }
  } catch (e) {
    status = "error";
    message = (e as Error).message;
    // A failing token exchange means the key is expired, revoked or wrong: surface it in the UI.
    if (e instanceof GarminApiError && e.path.includes("token")) setCredentialError(uid, message);
  } finally {
    const finished = new Date().toISOString();
    db.prepare("UPDATE sync_log SET finished = ?, status = ?, message = ? WHERE id = ?").run(finished, status, message, log.lastInsertRowid);
    state.lastRun = { started, finished, status, message };
    state.running = false;
    state.step = "";
  }
}

// One user at a time: the API is per-key, but this keeps load on Garmin (and the box) predictable.
const queue: number[] = [];
let draining = false;

export function enqueueSync(uid: number) {
  const state = syncState(uid);
  if (state.running || queue.includes(uid)) return;
  state.queued = true;
  queue.push(uid);
  void drain();
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) await syncUser(queue.shift()!);
  } finally {
    draining = false;
  }
}

export function syncAll() {
  for (const uid of usersWithKeys()) enqueueSync(uid);
}

/** For the CLI: run one user's sync to completion. */
export const runSyncNow = syncUser;
