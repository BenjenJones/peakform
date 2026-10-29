import { unpackJson } from "./codec.js";
import { db, tx } from "./db.js";

const DATE_KEYS = ["calendarDate", "summaryDate", "date", "calendarDateLocal"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const MAX_DEPTH = 4;

function dateOf(obj: Record<string, unknown>): string | null {
  for (const k of DATE_KEYS) {
    const v = obj[k];
    if (typeof v === "string" && ISO_DATE.test(v)) return v.slice(0, 10);
  }
  return null;
}

function flattenNumbers(obj: unknown, prefix: string, out: Map<string, number>, depth = 0) {
  if (depth > MAX_DEPTH || obj === null || typeof obj !== "object") return;
  // Arrays inside a day object are intraday samples; skip them, they are not daily metrics.
  if (Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "number" && Number.isFinite(v)) out.set(path, v);
    else if (v && typeof v === "object") flattenNumbers(v, path, out, depth + 1);
  }
}

/** Find every object carrying a calendar date anywhere in the payload. */
function* dayObjects(node: unknown, depth = 0): Generator<[string, Record<string, unknown>]> {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* dayObjects(item, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const date = dateOf(obj);
  if (date) {
    yield [date, obj];
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    // Neighbors outside the requested range (weight: previousDateWeight / nextDateWeight)
    // would otherwise be read as that day's summary.
    if (/^(previous|next)[A-Z]/.test(k)) continue;
    yield* dayObjects(v, depth + 1);
  }
}

/** Rebuild daily_metric from all raw_range payloads. Cheap enough to run after each sync. */
export function rebuildDailyMetrics(uid: number) {
  const rows = db.prepare("SELECT endpoint, payload FROM raw_range WHERE user_id = ? ORDER BY fetched_at").all(uid) as {
    endpoint: string;
    payload: Uint8Array;
  }[];
  const insert = db.prepare(
    "INSERT INTO daily_metric(user_id, date, metric, value) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, metric, date) DO UPDATE SET value = excluded.value",
  );
  tx(() => {
    db.prepare("DELETE FROM daily_metric WHERE user_id = ?").run(uid);
    for (const row of rows) {
      for (const [date, obj] of dayObjects(unpackJson(row.payload))) {
        const nums = new Map<string, number>();
        flattenNumbers(obj, "", nums);
        for (const [path, value] of nums) {
          // Skip ids and epoch timestamps; they are not metrics.
          if (/(^|\.)(id|date|.*Id|.*Pk)$/i.test(path) || /Timestamp|GMT|Epoch/i.test(path)) continue;
          insert.run(uid, date, `${row.endpoint}.${path}`, value);
        }
      }
    }
  });
}

/**
 * Curated metrics resolve to the first raw path that has data. The first
 * candidate of each is confirmed against real Personal API payloads (Oct 2026);
 * later ones are fallbacks guessed from Garmin Connect's web payloads.
 */
export const CURATED: Record<string, { label: string; unit: string; candidates: string[]; detail?: boolean }> = {
  rhr: {
    label: "Resting HR",
    unit: "bpm",
    candidates: ["daily_summaries.heartRate.restingValue", "daily_summaries.restingHeartRate"],
  },
  hrv_night: {
    label: "HRV (overnight avg)",
    unit: "ms",
    candidates: ["hrv.lastNightAvg", "hrv.hrvSummary.lastNightAvg"],
  },
  hrv_weekly: { label: "HRV (7-day avg)", unit: "ms", candidates: ["hrv.weeklyAvg"] },
  hrv_base_low: { label: "HRV baseline low", unit: "ms", candidates: ["hrv.baseline.balancedLow"] },
  hrv_base_high: { label: "HRV baseline high", unit: "ms", candidates: ["hrv.baseline.balancedUpper"] },
  sleep_score: {
    label: "Sleep score",
    unit: "",
    candidates: ["sleep_summaries.sleepScores.overall.value", "sleep_summaries.overallSleepScore", "sleep_summaries.sleepScore"],
  },
  sleep_hours: {
    label: "Sleep",
    unit: "h",
    candidates: ["sleep_summaries.sleepTimeSeconds", "daily_summaries.sleepingSeconds"],
  },
  deep_sleep_hours: { label: "Deep sleep", unit: "h", candidates: ["sleep_summaries.deepSleepSeconds"] },
  rem_sleep_hours: { label: "REM sleep", unit: "h", candidates: ["sleep_summaries.remSleepSeconds"] },
  light_sleep_hours: { label: "Light sleep", unit: "h", candidates: ["sleep_summaries.lightSleepSeconds"] },
  // Awake time during the night; not part of sleepTimeSeconds.
  awake_hours: { label: "Awake", unit: "h", candidates: ["sleep_summaries.awakeSleepSeconds"] },
  stress_avg: {
    label: "Avg stress",
    unit: "",
    candidates: ["stress.values.overallStressLevel", "stress.overallStressLevel", "daily_summaries.averageStressLevel"],
  },
  // Not body_battery.charged: that is the amount recharged that day, not the daily high.
  bb_high: {
    label: "Body Battery high",
    unit: "",
    candidates: ["daily_summaries.bodyBattery.maxValue", "daily_summaries.bodyBatteryHighestValue"],
  },
  bb_low: {
    label: "Body Battery low",
    unit: "",
    candidates: ["daily_summaries.bodyBattery.minValue", "daily_summaries.bodyBatteryLowestValue"],
  },
  steps: { label: "Steps", unit: "", candidates: ["steps.totalSteps", "daily_summaries.movement.steps.value"] },
  // Last weigh-in of the day; dailyWeightSummaries[].latestWeight
  weight: { label: "Weight", unit: "kg", candidates: ["weight.latestWeight.weight"] },

  // Day dashboard details, confirmed Oct 2026. `detail` keeps them out of the correlation matrix.
  steps_goal: { label: "Step goal", unit: "", candidates: ["daily_summaries.movement.steps.goal", "steps.stepGoal"], detail: true },
  distance_km: { label: "Distance", unit: "km", candidates: ["daily_summaries.movement.steps.distanceInMeters", "steps.totalDistance"], detail: true },
  floors: { label: "Floors climbed", unit: "", candidates: ["daily_summaries.movement.floorsAscended.value"], detail: true },
  calories_total: { label: "Calories burned", unit: "kcal", candidates: ["daily_summaries.calories.burnedTotal"], detail: true },
  calories_active: { label: "Active calories", unit: "kcal", candidates: ["daily_summaries.calories.burnedActive"], detail: true },
  intensity_moderate: { label: "Moderate intensity", unit: "min", candidates: ["daily_summaries.intensityMinutes.moderate"], detail: true },
  intensity_vigorous: { label: "Vigorous intensity", unit: "min", candidates: ["daily_summaries.intensityMinutes.vigorous"], detail: true },
  // Weekly goal, repeated on every day.
  intensity_goal: { label: "Intensity minutes goal", unit: "min", candidates: ["daily_summaries.intensityMinutes.goal"], detail: true },
  hr_max: { label: "Max HR (day)", unit: "bpm", candidates: ["daily_summaries.heartRate.maxValue"], detail: true },
  sleep_hr: { label: "Sleep HR", unit: "bpm", candidates: ["sleep_summaries.avgHeartRate"], detail: true },
  sleep_stress: { label: "Sleep stress", unit: "", candidates: ["sleep_summaries.avgSleepStress"], detail: true },
  sleep_resp: { label: "Sleep respiration", unit: "brpm", candidates: ["sleep_summaries.averageRespirationValue"], detail: true },
  spo2_avg: { label: "SpO2 (sleep avg)", unit: "%", candidates: ["sleep_summaries.averageSpO2Value", "daily_summaries.pulseOx.avgValue"], detail: true },
  // Garmin's sleep need for that night, adjusted for recent load and sleep debt.
  sleep_need_hours: { label: "Sleep need", unit: "h", candidates: ["sleep_summaries.sleepNeed.actual"], detail: true },
  bb_charged: { label: "Body Battery charged", unit: "", candidates: ["daily_summaries.bodyBattery.chargedValue", "body_battery.charged"], detail: true },
  bb_drained: { label: "Body Battery drained", unit: "", candidates: ["daily_summaries.bodyBattery.drainedValue", "body_battery.drained"], detail: true },
  stress_rest_hours: { label: "Rest", unit: "h", candidates: ["daily_summaries.stress.restDurationInMillis"], detail: true },
  stress_low_hours: { label: "Low stress", unit: "h", candidates: ["daily_summaries.stress.lowStressDurationInMillis"], detail: true },
  stress_medium_hours: { label: "Medium stress", unit: "h", candidates: ["daily_summaries.stress.mediumStressDurationInMillis"], detail: true },
  stress_high_hours: { label: "High stress", unit: "h", candidates: ["daily_summaries.stress.highStressDurationInMillis"], detail: true },
};

// Raw unit -> display unit, e.g. seconds -> hours.
const DIVISOR: Record<string, number> = {
  sleep_hours: 3600,
  deep_sleep_hours: 3600,
  rem_sleep_hours: 3600,
  light_sleep_hours: 3600,
  awake_hours: 3600,
  sleep_need_hours: 60,
  distance_km: 1000,
  stress_rest_hours: 3_600_000,
  stress_low_hours: 3_600_000,
  stress_medium_hours: 3_600_000,
  stress_high_hours: 3_600_000,
};

export function resolveCurated(uid: number, key: string): string | null {
  const def = CURATED[key];
  if (!def) return null;
  const has = db.prepare("SELECT 1 FROM daily_metric WHERE user_id = ? AND metric = ? LIMIT 1");
  return def.candidates.find((c) => has.get(uid, c)) ?? null;
}

export type Series = { date: string; value: number }[];

/** Series for a curated key or any raw metric path. */
export function metricSeries(uid: number, keyOrPath: string, from: string, to: string): Series {
  const path = CURATED[keyOrPath] ? resolveCurated(uid, keyOrPath) : keyOrPath;
  if (!path) return [];
  let rows = db
    .prepare("SELECT date, value FROM daily_metric WHERE user_id = ? AND metric = ? AND date BETWEEN ? AND ? ORDER BY date")
    .all(uid, path, from, to) as Series;
  const div = DIVISOR[keyOrPath];
  if (div) rows = rows.map((r) => ({ date: r.date, value: r.value / div }));
  // Weight is reported in grams by Connect.
  if (keyOrPath === "weight") rows = rows.map((r) => ({ date: r.date, value: r.value > 1000 ? r.value / 1000 : r.value }));
  return rows;
}
