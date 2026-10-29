import { decodeStreams } from "./codec.js";
import { db, kvGet } from "./db.js";
import type { Streams } from "./garmin/fit.js";
import { CURATED, metricSeries, type Series } from "./normalize.js";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
function* days(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

// ---------- Activities ----------

interface ActivityRow {
  id: number;
  start_local: string;
  type: string | null;
  name: string | null;
  summary: string;
}

export interface ActivityLite {
  id: number;
  date: string;
  start: string;
  type: string;
  name: string;
  durationS: number;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  elevGainM: number | null;
  garminLoad: number | null;
  load: number;
  loadSource: "garmin" | "trimp" | "none";
}

function hrBounds(uid: number) {
  const rhr = median(metricSeries(uid, "rhr", "0000-01-01", "9999-12-31").map((r) => r.value)) || 55;
  const zones = kvGet<{ maxHeartRateUsed?: number }[]>(uid, "single:hrZones");
  const zoneMax = Array.isArray(zones) ? zones.map((z) => z.maxHeartRateUsed).find((v) => typeof v === "number") : undefined;
  const observedMax = (db.prepare("SELECT max(json_extract(summary, '$.maxHR')) AS m FROM activity WHERE user_id = ?").get(uid) as { m: number | null }).m;
  return { rhr, maxHr: zoneMax ?? observedMax ?? 190 };
}

/** Banister TRIMP. Used when Garmin's own training load is missing from the summary. */
function trimp(durationS: number, avgHr: number, rhr: number, maxHr: number) {
  const hrr = Math.min(Math.max((avgHr - rhr) / (maxHr - rhr), 0), 1);
  return (durationS / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
}

export function listActivities(uid: number, from: string, to: string): ActivityLite[] {
  const rows = db
    .prepare("SELECT id, start_local, type, name, summary FROM activity WHERE user_id = ? AND substr(start_local, 1, 10) BETWEEN ? AND ? ORDER BY start_local DESC")
    .all(uid, from, to) as unknown as ActivityRow[];
  const { rhr, maxHr } = hrBounds(uid);
  return rows.map((r) => {
    const s = JSON.parse(r.summary);
    const durationS = s.movingDuration ?? s.duration ?? 0;
    const avgHr = s.averageHR ?? null;
    const garminLoad = s.activityTrainingLoad ?? null;
    let load = 0;
    let loadSource: ActivityLite["loadSource"] = "none";
    if (typeof garminLoad === "number") {
      load = garminLoad;
      loadSource = "garmin";
    } else if (avgHr && durationS) {
      load = trimp(durationS, avgHr, rhr, maxHr);
      loadSource = "trimp";
    }
    return {
      id: r.id,
      date: r.start_local.slice(0, 10),
      start: r.start_local,
      type: r.type ?? "other",
      name: r.name ?? "",
      durationS,
      distanceM: s.distance ?? null,
      avgHr,
      maxHr: s.maxHR ?? null,
      avgPower: s.avgPower ?? null,
      elevGainM: s.elevationGain ?? null,
      garminLoad,
      load,
      loadSource,
    };
  });
}

// ---------- Training load (CTL / ATL / TSB) ----------

export interface LoadDay {
  date: string;
  load: number;
  ctl: number; // fitness, 42d EWMA
  atl: number; // fatigue, 7d EWMA
  tsb: number; // form = yesterday's ctl - atl
  acwr: number | null;
}

export function trainingLoad(uid: number, from: string, to: string): LoadDay[] {
  // Warm up the EWMAs on 120 days of history before the requested window.
  const warmFrom = addDays(from, -120);
  const perDay = new Map<string, number>();
  for (const a of listActivities(uid, warmFrom, to)) perDay.set(a.date, (perDay.get(a.date) ?? 0) + a.load);

  const kCtl = 1 - Math.exp(-1 / 42);
  const kAtl = 1 - Math.exp(-1 / 7);
  let ctl = 0;
  let atl = 0;
  const out: LoadDay[] = [];
  for (const d of days(warmFrom, to)) {
    const load = perDay.get(d) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) * kCtl;
    atl += (load - atl) * kAtl;
    if (d >= from) out.push({ date: d, load, ctl, atl, tsb, acwr: ctl > 1 ? atl / ctl : null });
  }
  return out;
}

// ---------- Streams ----------

export function activityStreams(uid: number, id: number): Streams | null {
  const row = db.prepare("SELECT streams FROM activity_stream WHERE user_id = ? AND activity_id = ?").get(uid, id) as { streams: Uint8Array } | undefined;
  return row ? decodeStreams(row.streams) : null;
}

/** Resample to 1 Hz with forward fill so rolling windows are time-correct. */
function to1Hz(t: number[], v: (number | null)[]): number[] {
  if (!t.length) return [];
  const out = new Array<number>(t[t.length - 1] + 1);
  let j = 0;
  let last = 0;
  for (let sec = 0; sec < out.length; sec++) {
    while (j < t.length && t[j] <= sec) {
      if (v[j] !== null) last = v[j] as number;
      j++;
    }
    out[sec] = last;
  }
  return out;
}

export const CURVE_DURATIONS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200];

/** Best average value sustained for each duration. */
export function meanMax(streams: Streams, field: "power" | "speed" | "hr"): { durationS: number; value: number }[] {
  const v = to1Hz(streams.t, streams[field]);
  if (!v.some((x) => x > 0)) return [];
  const prefix = new Float64Array(v.length + 1);
  for (let i = 0; i < v.length; i++) prefix[i + 1] = prefix[i] + v[i];
  const out: { durationS: number; value: number }[] = [];
  for (const d of CURVE_DURATIONS) {
    if (d > v.length) break;
    let best = 0;
    for (let i = d; i <= v.length; i++) best = Math.max(best, prefix[i] - prefix[i - d]);
    out.push({ durationS: d, value: best / d });
  }
  return out;
}

export function bestCurve(uid: number, from: string, to: string, field: "power" | "speed" | "hr", type?: string) {
  const best = new Map<number, { value: number; activityId: number; date: string }>();
  for (const a of listActivities(uid, from, to)) {
    if (type && a.type !== type) continue;
    const s = activityStreams(uid, a.id);
    if (!s) continue;
    for (const p of meanMax(s, field)) {
      const cur = best.get(p.durationS);
      if (!cur || p.value > cur.value) best.set(p.durationS, { value: p.value, activityId: a.id, date: a.date });
    }
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([durationS, b]) => ({ durationS, ...b }));
}

/**
 * Aerobic decoupling (Pa:HR): drift in output-per-heartbeat between halves.
 * Under ~5% suggests a well-developed aerobic base for that effort.
 */
export function decoupling(streams: Streams): number | null {
  const out = streams.power.some((p) => (p ?? 0) > 0) ? streams.power : streams.speed;
  const pairs = streams.hr.map((h, i) => [out[i], h] as const).filter(([o, h]) => o && h && o > 0 && h > 0) as [number, number][];
  if (pairs.length < 600) return null;
  const half = Math.floor(pairs.length / 2);
  const ratio = (xs: [number, number][]) => mean(xs.map((p) => p[0])) / mean(xs.map((p) => p[1]));
  const first = ratio(pairs.slice(0, half));
  const second = ratio(pairs.slice(half));
  return ((first - second) / first) * 100;
}

// ---------- Insights ----------

function seriesFor(uid: number, key: string, from: string, to: string): Map<string, number> {
  if (key.startsWith("load.")) {
    const field = key.slice(5) as keyof LoadDay;
    return new Map(trainingLoad(uid, from, to).map((d) => [d.date, d[field] as number]));
  }
  return new Map(metricSeries(uid, key, from, to).map((r: Series[number]) => [r.date, r.value]));
}

function pearson(xs: number[], ys: number[]) {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

/** Pairs x on day D with y on day D + lag. */
export function paired(uid: number, x: string, y: string, from: string, to: string, lag = 0) {
  const xs = seriesFor(uid, x, from, to);
  const ys = seriesFor(uid, y, from, addDays(to, lag));
  const points: { date: string; x: number; y: number }[] = [];
  for (const [d, xv] of xs) {
    const yv = ys.get(addDays(d, lag));
    if (yv !== undefined) points.push({ date: d, x: xv, y: yv });
  }
  return { points, r: points.length >= 10 ? pearson(points.map((p) => p.x), points.map((p) => p.y)) : null, n: points.length };
}

export const INSIGHT_METRICS = [
  ...Object.keys(CURATED).filter((k) => !k.startsWith("hrv_base") && !CURATED[k].detail),
  "load.load",
  "load.tsb",
  "load.atl",
];

/** Correlation of every metric today with every metric tomorrow (lag 1) or same day (lag 0). */
export function correlationMatrix(uid: number, from: string, to: string, lag: number) {
  const cache = new Map(INSIGHT_METRICS.map((k) => [k, seriesFor(uid, k, from, addDays(to, lag))]));
  const cells: { x: string; y: string; r: number | null; n: number }[] = [];
  for (const x of INSIGHT_METRICS) {
    for (const y of INSIGHT_METRICS) {
      const xs = cache.get(x)!;
      const ys = cache.get(y)!;
      const a: number[] = [];
      const b: number[] = [];
      for (const [d, xv] of xs) {
        const yv = ys.get(addDays(d, lag));
        if (yv !== undefined) {
          a.push(xv);
          b.push(yv);
        }
      }
      cells.push({ x, y, r: a.length >= 10 && !(x === y && lag === 0) ? pearson(a, b) : null, n: a.length });
    }
  }
  return cells;
}

/**
 * Readiness: today's HRV, RHR, sleep and form as z-scores against a rolling
 * 60-day personal baseline, combined into a 0-100 score. Not Garmin's model.
 */
export function readiness(uid: number, date: string) {
  const from = addDays(date, -60);
  const comp = (key: string, invert = false) => {
    const s = seriesFor(uid, key, from, date);
    const today = s.get(date);
    const base = [...s.entries()].filter(([d]) => d < date).map(([, v]) => v);
    if (today === undefined || base.length < 14) return null;
    const z = (today - mean(base)) / (sd(base) || 1);
    return { key, today, baseline: mean(base), z: invert ? -z : z };
  };
  const parts = [comp("hrv_night"), comp("rhr", true), comp("sleep_score"), comp("load.tsb")].filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  if (!parts.length) return { date, score: null, parts };
  const z = mean(parts.map((p) => Math.max(-2.5, Math.min(2.5, p.z))));
  return { date, score: Math.round(50 + z * 20), parts };
}

// ---------- Day ----------

const DAY_METRICS = [
  "hrv_night", "hrv_weekly", "hrv_base_low", "hrv_base_high", "rhr", "sleep_score", "sleep_hours", "sleep_need_hours",
  "deep_sleep_hours", "light_sleep_hours", "rem_sleep_hours", "awake_hours", "sleep_hr", "sleep_stress", "sleep_resp",
  "spo2_avg", "stress_avg", "stress_rest_hours", "stress_low_hours", "stress_medium_hours", "stress_high_hours",
  "bb_high", "bb_low", "bb_charged", "bb_drained", "steps", "steps_goal", "distance_km", "floors", "calories_total",
  "calories_active", "intensity_moderate", "intensity_vigorous", "intensity_goal", "hr_max", "weight",
];

export interface DayMetric {
  value: number | null;
  /** Mean of the 7 days before. */
  avg7: number | null;
  /** The 60 days before, once at least 14 of them have data. */
  baseline: { mean: number; sd: number } | null;
  /** Last 14 days up to and including the day. */
  trend: Series;
}

/** Everything the day dashboard shows for one calendar day. */
export function daySummary(uid: number, date: string) {
  const trendFrom = addDays(date, -13);
  const metrics: Record<string, DayMetric> = {};
  for (const key of DAY_METRICS) {
    const s = metricSeries(uid, key, addDays(date, -60), date);
    const before = s.filter((p) => p.date < date).map((p) => p.value);
    const week = s.filter((p) => p.date < date && p.date >= addDays(date, -7)).map((p) => p.value);
    metrics[key] = {
      value: s.find((p) => p.date === date)?.value ?? null,
      avg7: week.length ? mean(week) : null,
      baseline: before.length >= 14 ? { mean: mean(before), sd: sd(before) } : null,
      trend: s.filter((p) => p.date >= trendFrom),
    };
  }
  // Garmin's intensity goal is per Monday-to-Sunday week, and vigorous minutes count double.
  const monday = addDays(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
  const weekSum = (key: string) => metrics[key].trend.filter((p) => p.date >= monday).reduce((a, p) => a + p.value, 0);
  const span = db.prepare("SELECT min(date) AS first, max(date) AS last FROM daily_metric WHERE user_id = ?").get(uid) as {
    first: string | null;
    last: string | null;
  };
  return {
    date,
    ...span,
    metrics,
    intensityWeek: weekSum("intensity_moderate") + 2 * weekSum("intensity_vigorous"),
    readiness: readiness(uid, date),
    load: trainingLoad(uid, trendFrom, date),
    activities: listActivities(uid, date, date).reverse(),
  };
}
