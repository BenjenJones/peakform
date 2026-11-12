// AI review of sport activities through the Claude API. Every user brings their own Anthropic API
// key from the Claude Console; reviews are billed to that key's organization.

import Anthropic from "@anthropic-ai/sdk";
import { activityStreams, decoupling, hrLimitFor, isRun, listActivities, readiness, trainingLoad, withStepCadence } from "./analytics.js";
import { unpackJson } from "./codec.js";
import { decryptSecret, encryptSecret, needsReencrypt } from "./crypto.js";
import { db, kvGet, kvSet } from "./db.js";
import { metricSeries } from "./normalize.js";

// ---------- Types ----------

export type ReviewStatus = "queued" | "running" | "done" | "error" | "quota" | "auth";

export interface ReviewResult {
  score: number;
  headline: string;
  summary: string;
  positives: string[];
  improvements: string[];
  recovery: string;
  nextSession: string;
}

export interface ReviewRow {
  status: ReviewStatus;
  trigger: "auto" | "manual";
  review: ReviewResult | null;
  model: string | null;
  error: string | null;
  updatedAt: string;
}

export interface ReviewProfile {
  sex: "male" | "female" | null;
  birthDate: string | null;
  /** Free text added to the system prompt: goals, injuries, context. */
  goals: string;
  model: ReviewModel;
}

export const REVIEW_MODELS = ["opus", "sonnet", "haiku"] as const;
export type ReviewModel = (typeof REVIEW_MODELS)[number];
const MODEL_IDS: Record<ReviewModel, string> = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" };
export const MAX_GOALS = 4000;

export interface ReviewNotice {
  code: "quota" | "auth";
  message: string;
  at: string;
  activityId: number;
}

const now = () => new Date().toISOString();
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};

export function reviewProfile(uid: number): ReviewProfile {
  const p = kvGet<Partial<ReviewProfile>>(uid, "reviewProfile") ?? {};
  const model = REVIEW_MODELS.find((m) => m === p.model) ?? "opus";
  return { sex: p.sex ?? null, birthDate: p.birthDate ?? null, goals: p.goals ?? "", model };
}

export const setReviewProfile = (uid: number, p: ReviewProfile) => kvSet(uid, "reviewProfile", p);

// ---------- Anthropic API key (encrypted at rest, like the Garmin key) ----------

const KV_KEY = "anthropicKey";
const keyContext = (uid: number) => `anthropic-api-key:user:${uid}`;
interface StoredKey { ciphertext: string; updatedAt: string }

export function storeAnthropicKey(uid: number, key: string) {
  kvSet(uid, KV_KEY, { ciphertext: encryptSecret(key, keyContext(uid)), updatedAt: now() } satisfies StoredKey);
}

export const deleteAnthropicKey = (uid: number) => db.prepare("DELETE FROM user_kv WHERE user_id = ? AND key = ?").run(uid, KV_KEY);

export const anthropicKeyInfo = (uid: number) => {
  const t = kvGet<StoredKey>(uid, KV_KEY);
  return t ? { updatedAt: t.updatedAt } : null;
};

function loadAnthropicKey(uid: number): string | null {
  const t = kvGet<StoredKey>(uid, KV_KEY);
  return t ? decryptSecret(t.ciphertext, keyContext(uid)) : null;
}

/** After a master-key rotation; mirrors users.reencryptCredentials. */
export function reencryptAnthropicKeys() {
  const rows = db.prepare("SELECT user_id FROM user_kv WHERE key = ?").all(KV_KEY) as { user_id: number }[];
  for (const { user_id } of rows) {
    const t = kvGet<StoredKey>(user_id, KV_KEY)!;
    if (!needsReencrypt(t.ciphertext)) continue;
    try {
      kvSet(user_id, KV_KEY, { ...t, ciphertext: encryptSecret(decryptSecret(t.ciphertext, keyContext(user_id)), keyContext(user_id)) });
    } catch (e) {
      console.error(`Cannot decrypt Anthropic API key of user ${user_id}: ${(e as Error).message}`);
    }
  }
}

export const reviewsConfigured = (uid: number) => anthropicKeyInfo(uid) !== null;

/** Checks a key before storing it; listing models is free. */
export async function verifyAnthropicKey(key: string): Promise<"ok" | "rejected" | "unreachable"> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 }).models.list({ limit: 1 });
    return "ok";
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "rejected";
    return "unreachable";
  }
}

// ---------- Which activities get reviewed ----------

/** Everyday movement and relaxation are not training; everything else is. */
const NOT_SPORT = /walk|breathwork|meditation|sleep|tai_chi/;
const MIN_AUTO_S = 5 * 60;

export const isSportType = (type: string | null) => !!type && !NOT_SPORT.test(type);

/**
 * Day from which new activities are reviewed automatically. Set once, on the first start of the
 * version with reviews (or a user's first sync), so the existing history is never reviewed in bulk.
 */
export function reviewSince(uid: number): string {
  let since = kvGet<string>(uid, "reviewSince");
  if (!since) kvSet(uid, "reviewSince", (since = isoDay(new Date())));
  return since;
}

export function initReviewSince() {
  for (const { id } of db.prepare("SELECT id FROM user").all() as { id: number }[]) reviewSince(id);
}

export function getReview(uid: number, activityId: number): ReviewRow | null {
  const r = db.prepare("SELECT status, trigger, review, model, error, updated_at FROM activity_review WHERE user_id = ? AND activity_id = ?").get(uid, activityId) as
    | { status: ReviewStatus; trigger: "auto" | "manual"; review: string | null; model: string | null; error: string | null; updated_at: string }
    | undefined;
  if (!r) return null;
  return { status: r.status, trigger: r.trigger, review: r.review ? JSON.parse(r.review) : null, model: r.model, error: r.error, updatedAt: r.updated_at };
}

/** Status and score per activity, for lists. */
export function reviewMap(uid: number) {
  const rows = db
    .prepare("SELECT activity_id, status, json_extract(review, '$.score') AS score FROM activity_review WHERE user_id = ?")
    .all(uid) as { activity_id: number; status: ReviewStatus; score: number | null }[];
  return new Map(rows.map((r) => [r.activity_id, { status: r.status, score: r.score }]));
}

/** Retry a failed automatic review at most this often; quota resets take hours anyway. */
const RETRY_AFTER_MS = 60 * 60_000;
const MAX_AUTO_ATTEMPTS = 5;

/** After a sync: queue new sport activities since the release day that have no review yet. */
export function queueAutoReviews(uid: number) {
  if (!reviewsConfigured(uid)) return;
  const since = reviewSince(uid);
  const rows = db
    .prepare(
      `SELECT a.id, a.type, a.summary, r.status, r.attempts, r.updated_at FROM activity a
       LEFT JOIN activity_review r ON r.user_id = a.user_id AND r.activity_id = a.id
       WHERE a.user_id = ? AND substr(a.start_local, 1, 10) >= ? AND a.fit_status != 'pending'`,
    )
    .all(uid, since) as { id: number; type: string | null; summary: string; status: ReviewStatus | null; attempts: number | null; updated_at: string | null }[];
  const retryBefore = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
  for (const r of rows) {
    if (!isSportType(r.type)) continue;
    const s = JSON.parse(r.summary);
    if ((s.movingDuration ?? s.duration ?? 0) < MIN_AUTO_S) continue;
    const retry = (r.status === "error" || r.status === "quota" || r.status === "auth") && r.updated_at! < retryBefore && r.attempts! < MAX_AUTO_ATTEMPTS;
    if (r.status === null || retry) enqueueReview(uid, r.id, "auto");
  }
}

// ---------- Queue ----------

const queue: { uid: number; id: number }[] = [];
let draining = false;

export function enqueueReview(uid: number, id: number, trigger: "auto" | "manual") {
  if (queue.some((q) => q.uid === uid && q.id === id)) return;
  db.prepare(
    `INSERT INTO activity_review(user_id, activity_id, status, trigger, updated_at) VALUES(?, ?, 'queued', ?, ?)
     ON CONFLICT(user_id, activity_id) DO UPDATE SET status = 'queued', trigger = excluded.trigger, updated_at = excluded.updated_at`,
  ).run(uid, id, trigger, now());
  if (trigger === "manual") db.prepare("UPDATE activity_review SET attempts = 0 WHERE user_id = ? AND activity_id = ?").run(uid, id);
  queue.push({ uid, id });
  void drain();
}

/** Reviews interrupted by a restart run again. */
export function resumeReviews() {
  db.prepare("UPDATE activity_review SET status = 'queued' WHERE status = 'running'").run();
  const rows = db.prepare("SELECT user_id, activity_id FROM activity_review WHERE status = 'queued' ORDER BY updated_at").all() as { user_id: number; activity_id: number }[];
  for (const r of rows) queue.push({ uid: r.user_id, id: r.activity_id });
  void drain();
}

export function reviewQueueInfo(uid: number) {
  const c = db.prepare("SELECT count(*) AS n FROM activity_review WHERE user_id = ? AND status IN ('queued', 'running')").get(uid) as { n: number };
  return { pending: c.n };
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const { uid, id } = queue.shift()!;
      await reviewOne(uid, id);
    }
  } finally {
    draining = false;
  }
}

export const reviewNotice = (uid: number) => kvGet<ReviewNotice>(uid, "reviewNotice");
export const clearReviewNotice = (uid: number) => db.prepare("DELETE FROM user_kv WHERE user_id = ? AND key = 'reviewNotice'").run(uid);

async function reviewOne(uid: number, id: number) {
  const setRow = (status: ReviewStatus, fields: { review?: string; model?: string; error?: string | null } = {}) =>
    db
      .prepare(
        `UPDATE activity_review SET status = ?, review = coalesce(?, review), model = coalesce(?, model), error = ?, updated_at = ?,
         attempts = attempts + (CASE WHEN ? IN ('done', 'error', 'quota', 'auth') THEN 1 ELSE 0 END)
         WHERE user_id = ? AND activity_id = ?`,
      )
      .run(status, fields.review ?? null, fields.model ?? null, fields.error ?? null, now(), status, uid, id);

  const row = db.prepare("SELECT status FROM activity_review WHERE user_id = ? AND activity_id = ?").get(uid, id) as { status: string } | undefined;
  if (row?.status !== "queued") return; // deleted or already handled
  setRow("running");
  try {
    const input = buildInput(uid, id);
    if (!input) return void setRow("error", { error: "Activity not found" });
    const profile = reviewProfile(uid);
    const out = await callClaude(uid, input.prompt, systemPrompt(input.lang, profile.goals), profile.model);
    if (out.ok) {
      setRow("done", { review: JSON.stringify(out.result), model: out.model });
      if (reviewNotice(uid)) clearReviewNotice(uid);
      return;
    }
    setRow(out.code, { error: out.message });
    if (out.code === "quota" || out.code === "auth") {
      kvSet(uid, "reviewNotice", { code: out.code, message: out.message, at: now(), activityId: id } satisfies ReviewNotice);
      // The rest of this user's queue would fail the same way: park it until the next attempt.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].uid !== uid) continue;
        const q = queue.splice(i, 1)[0];
        db.prepare("UPDATE activity_review SET status = ?, error = ?, updated_at = ? WHERE user_id = ? AND activity_id = ?").run(out.code, out.message, now(), uid, q.id);
      }
    }
  } catch (e) {
    setRow("error", { error: (e as Error).message });
  }
}

// ---------- Prompt ----------

function systemPrompt(lang: "de" | "en", goals: string) {
  const language = lang === "de" ? "German (informal \"du\")" : "English";
  return [
    "You are an experienced endurance and fitness coach reviewing one completed training session of an athlete.",
    "You get the session's data from a Garmin watch plus context: the athlete's profile, recovery state around the session, recent training load and earlier sessions of the same sport.",
    "Judge the session against what it was most likely meant to be (easy, long, tempo, intervals, race, strength…), the athlete's current form and recovery, and their goals.",
    "Be specific and refer to actual numbers (pace, heart rate, zones, decoupling, laps). Do not invent data that is not given; if something important is missing, say so briefly.",
    "Do not give medical diagnoses. If the data suggests a health concern, recommend seeing a doctor.",
    "Score: 1–10 for how well the session served the athlete's training, given their state that day (10 = ideal execution and fit, 5 = okay but clear issues, 1 = counterproductive).",
    `Write all text in ${language}. Keep it concise: summary 2–4 sentences, 1–4 short bullet points per list, recovery and next session one or two sentences each.`,
    goals.trim() ? `\nAdditional information from the athlete (goals, context, preferences):\n${goals.trim()}` : "",
  ].join("\n");
}

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", description: "1 to 10" },
    headline: { type: "string", description: "One short line, like a title" },
    summary: { type: "string" },
    positives: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    recovery: { type: "string", description: "Recovery advice after this session" },
    nextSession: { type: "string", description: "Suggestion for the next session(s)" },
  },
  required: ["score", "headline", "summary", "positives", "improvements", "recovery", "nextSession"],
  additionalProperties: false,
};

const round = (v: unknown, digits = 0) => (typeof v === "number" && Number.isFinite(v) ? +v.toFixed(digits) : undefined);
const pace = (mps: unknown) => {
  if (typeof mps !== "number" || mps <= 0) return undefined;
  const s = Math.round(1000 / mps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} /km`;
};
const minutes = (s: unknown) => round(typeof s === "number" ? s / 60 : undefined, 1);

function ageOn(birthDate: string | null, day: string) {
  if (!birthDate) return undefined;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Latest value on or before `day`, within `lookback` days. */
function valueOn(uid: number, key: string, day: string, lookback = 0) {
  const s = metricSeries(uid, key, addDays(day, -lookback), day);
  return s.at(-1)?.value;
}

function avg(uid: number, key: string, from: string, to: string) {
  const s = metricSeries(uid, key, from, to);
  return s.length ? s.reduce((a, p) => a + p.value, 0) / s.length : undefined;
}

function reviewLang(uid: number): "de" | "en" {
  const pref = kvGet<Record<string, string>>(uid, "prefs")?.lang;
  if (pref === "de" || pref === "en") return pref;
  const locale = kvGet<{ preferredLocale?: string }>(uid, "single:profile")?.preferredLocale;
  return locale?.startsWith("de") ? "de" : "en";
}

export function buildInput(uid: number, id: number) {
  const row = db.prepare("SELECT start_local, type, name, summary, detail FROM activity WHERE user_id = ? AND id = ?").get(uid, id) as
    | { start_local: string; type: string | null; name: string | null; summary: string; detail: Uint8Array | null }
    | undefined;
  if (!row) return null;
  const s = JSON.parse(row.summary);
  const day = row.start_local.slice(0, 10);
  const run = isRun(row.type);
  const profile = reviewProfile(uid);
  const detail = row.detail ? unpackJson<{ laps?: Record<string, number>[]; session?: Record<string, number> }>(row.detail) : null;
  const raw = activityStreams(uid, id);
  const streams = raw && run ? withStepCadence(raw) : raw;
  const dec = streams ? decoupling(streams, run) : null;
  const zones = kvGet<Record<string, unknown>[]>(uid, "single:hrZones");

  const athlete = {
    sex: profile.sex ?? "unknown",
    age: ageOn(profile.birthDate, day) ?? "unknown",
    weightKg: round(valueOn(uid, "weight", day, 60), 1),
    heartRateZones: Array.isArray(zones)
      ? zones.map((z) => ({ sport: z.sport, method: z.trainingMethod, restingHr: z.restingHeartRateUsed, lactateThresholdHr: z.lactateThresholdHeartRateUsed, maxHr: z.maxHeartRateUsed, zoneFloors: [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor] }))
      : undefined,
    personalHrLimitForThisSport: hrLimitFor(uid, row.type) ?? undefined,
  };

  const zoneMinutes = (prefix: string) => {
    const v = [1, 2, 3, 4, 5].map((i) => minutes(s[`${prefix}${i}`]));
    return v.some((x) => x !== undefined) ? v : undefined;
  };

  const session = {
    sport: row.type,
    name: row.name,
    startLocal: row.start_local,
    durationMin: minutes(s.duration),
    movingMin: minutes(s.movingDuration),
    elapsedMin: minutes(s.elapsedDuration),
    distanceKm: round(typeof s.distance === "number" ? s.distance / 1000 : undefined, 2),
    avgPace: run || /hik|walk/.test(row.type ?? "") ? pace(s.averageSpeed) : undefined,
    gradeAdjustedPace: pace(s.avgGradeAdjustedSpeed),
    avgSpeedKmh: !run ? round(typeof s.averageSpeed === "number" ? s.averageSpeed * 3.6 : undefined, 1) : undefined,
    avgHr: round(s.averageHR),
    maxHr: round(s.maxHR),
    avgPowerW: round(s.avgPower),
    normPowerW: round(s.normPower),
    maxPowerW: round(s.maxPower),
    elevationGainM: round(s.elevationGain),
    elevationLossM: round(s.elevationLoss),
    avgCadence: round(s.averageRunningCadenceInStepsPerMinute ?? s.averageBikingCadenceInRevPerMinute),
    avgStrideM: round(typeof s.avgStrideLength === "number" ? s.avgStrideLength / 100 : undefined, 2),
    groundContactMs: round(s.avgGroundContactTime),
    verticalOscillationCm: round(s.avgVerticalOscillation, 1),
    aerobicTrainingEffect: round(s.aerobicTrainingEffect, 1),
    anaerobicTrainingEffect: round(s.anaerobicTrainingEffect, 1),
    trainingEffectLabel: s.trainingEffectLabel,
    garminTrainingLoad: round(s.activityTrainingLoad),
    calories: round(s.calories),
    bodyBatteryChange: round(s.differenceBodyBattery),
    temperatureC: s.minTemperature !== undefined ? [round(s.minTemperature), round(s.maxTemperature)] : undefined,
    avgRespirationRate: round(s.avgRespirationRate, 1),
    minutesInHrZones1to5: zoneMinutes("hrTimeInZone_"),
    minutesInPowerZones1to5: zoneMinutes("powerTimeInZone_"),
    aerobicDecoupling: dec ? { percent: round(dec.pct, 1), basis: dec.basis, halves: dec.halves.map((h) => ({ output: dec.basis === "speed" ? pace(h.out) : `${round(h.out)} W`, avgHr: round(h.hr) })) } : undefined,
    laps: detail?.laps?.slice(0, 40).map((l) => ({
      min: minutes(l.totalTimerTime),
      km: round(typeof l.totalDistance === "number" ? l.totalDistance / 1000 : undefined, 2),
      pace: run ? pace(l.enhancedAvgSpeed) : undefined,
      kmh: !run ? round(typeof l.enhancedAvgSpeed === "number" ? l.enhancedAvgSpeed * 3.6 : undefined, 1) : undefined,
      avgHr: l.avgHeartRate,
      maxHr: l.maxHeartRate,
      avgW: l.avgPower,
      cadence: run && l.avgCadence ? l.avgCadence * 2 : l.avgCadence,
      ascentM: l.totalAscent,
    })),
  };

  // Recovery around the session: the night before is stored under the session's day.
  const recoveryKeys = ["hrv_night", "rhr", "rhr_night", "sleep_score", "sleep_hours", "bb_high", "stress_avg"] as const;
  const recovery = Object.fromEntries(
    recoveryKeys.map((k) => [k, { day: round(valueOn(uid, k, day), 1), avg7DaysBefore: round(avg(uid, k, addDays(day, -7), addDays(day, -1)), 1), avg60DaysBefore: round(avg(uid, k, addDays(day, -60), addDays(day, -1)), 1) }]),
  );
  const ready = readiness(uid, day);
  const load = trainingLoad(uid, day, day)[0];

  const recent = listActivities(uid, addDays(day, -14), day)
    .filter((a) => a.id !== id && a.start < row.start_local)
    .map((a) => ({ date: a.date, sport: a.type, min: minutes(a.durationS), km: round(a.distanceM ? a.distanceM / 1000 : undefined, 1), avgHr: round(a.avgHr), load: round(a.load) }));
  const sameSport = listActivities(uid, addDays(day, -120), day)
    .filter((a) => a.type === row.type && a.id !== id && a.start < row.start_local)
    .slice(0, 12)
    .map((a) => ({
      date: a.date,
      min: minutes(a.durationS),
      km: round(a.distanceM ? a.distanceM / 1000 : undefined, 2),
      pace: run && a.distanceM && a.durationS ? pace(a.distanceM / a.durationS) : undefined,
      avgHr: round(a.avgHr),
      avgW: round(a.avgPower),
      elevM: round(a.elevGainM),
    }));

  const data = {
    athlete,
    session,
    recovery: {
      note: "Values of the session's day (sleep and HRV of the night before), with the 7- and 60-day averages before it. Keys: hrv_night ms, rhr / rhr_night bpm, sleep_score 0-100, sleep_hours, bb_high = Body Battery peak, stress_avg 0-100.",
      ...recovery,
      readiness0to100: ready.score ?? undefined,
    },
    trainingLoad: load
      ? { note: "Banister model from Garmin training load: ctl = fitness (42 d), atl = fatigue (7 d), tsb = form, acwr = acute:chronic ratio", ctl: round(load.ctl), atl: round(load.atl), tsb: round(load.tsb), acwr: round(load.acwr, 2) }
      : undefined,
    activitiesLast14Days: recent,
    earlierSessionsSameSport: sameSport,
  };

  const prompt = `Review this training session. Data (JSON, missing values omitted):\n\n${JSON.stringify(data)}`;
  return { prompt, lang: reviewLang(uid) };
}

// ---------- Claude API ----------

type ClaudeOutcome =
  | { ok: true; result: ReviewResult; model: string }
  | { ok: false; code: "quota" | "auth" | "error"; message: string };

/**
 * Out of credit: a `billing_error`, the organization's monthly spend limit, or (older wording of
 * the same condition) a 400 about the credit balance.
 */
function isOutOfCredit(e: InstanceType<typeof Anthropic.APIError>) {
  return e.type === "billing_error" || e.errorCode === "enforced_spend_limit_reached" || (e.status === 400 && /credit balance/i.test(e.apiMessage ?? ""));
}

async function callClaude(uid: number, prompt: string, system: string, model: ReviewModel): Promise<ClaudeOutcome> {
  const apiKey = loadAnthropicKey(uid);
  if (!apiKey) return { ok: false, code: "auth", message: "No Anthropic API key stored" };
  const client = new Anthropic({ apiKey, timeout: 5 * 60_000 });
  try {
    const response = await client.messages.create({
      model: MODEL_IDS[model],
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: { type: "json_schema", schema: REVIEW_SCHEMA } },
    });
    if (response.stop_reason === "refusal") return { ok: false, code: "error", message: "Claude declined to review this activity" };
    if (response.stop_reason === "max_tokens") return { ok: false, code: "error", message: "The review was cut off" };
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const r = JSON.parse(text) as ReviewResult;
    return {
      ok: true,
      model: response.model,
      result: {
        score: Math.min(10, Math.max(1, Math.round(Number(r.score) || 0))),
        headline: String(r.headline ?? ""),
        summary: String(r.summary ?? ""),
        positives: (r.positives ?? []).map(String),
        improvements: (r.improvements ?? []).map(String),
        recovery: String(r.recovery ?? ""),
        nextSession: String(r.nextSession ?? ""),
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const message = (e.apiMessage ?? e.message).slice(0, 500);
      if (isOutOfCredit(e)) return { ok: false, code: "quota", message };
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { ok: false, code: "auth", message };
      return { ok: false, code: "error", message };
    }
    return { ok: false, code: "error", message: (e as Error).message.slice(0, 500) };
  }
}
