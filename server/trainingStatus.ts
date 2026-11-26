import { hrBounds, trainingLoad } from "./analytics.js";
import { db } from "./db.js";
import { metricSeries } from "./normalize.js";

/**
 * Training status in the spirit of Garmin's: load (acute vs chronic), the fitness trend from an
 * estimated VO2max and recovery (HRV status, resting HR, sleep). Not Garmin's model; the rules
 * and thresholds are our own.
 */

const addDays = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// ---------- VO2max estimate ----------

/** Shorter runs have not reached a steady heart rate. */
const VO2_MIN_RUN_S = 600;
const VO2_MIN_RIDE_S = 1200;
/** Below this share of max HR, the heart rate says too little about the effort. */
const VO2_MIN_HR_SHARE = 0.7;
/** Without grade adjusted pace, hilly runs would read as poor fitness. */
const VO2_MAX_GRADE = 0.02;
/** Efforts that make up the estimate of a day. */
const VO2_WINDOW_DAYS = 28;
const VO2_MIN_EFFORTS = 2;
/** Change of the estimate over this many days sets the fitness trend. */
const TREND_DAYS = 21;
/** ml/kg/min; smaller changes are noise. */
const TREND_STEP = 0.5;

/**
 * Intensity the estimates are normalised to, as a share of heart rate reserve. Extrapolating
 * from an easy run reads high: during exercise heart rate sits well above the resting value the
 * line is drawn through. Closer to threshold the extrapolation is shorter and more reliable.
 */
const VO2_REF_HRR = 0.8;
/** History the intensity correction is learnt from, and what it needs to be trusted. */
const VO2_CAL_DAYS = 365;
const VO2_CAL_MIN_EFFORTS = 15;
const VO2_CAL_MIN_SD = 0.03;

export interface Vo2Effort {
  activityId: number;
  date: string;
  sport: "run" | "ride";
  vo2max: number;
  /** Share of heart rate reserve at the activity's average heart rate. */
  hrr: number;
}

/**
 * VO2max per qualifying activity: the oxygen cost of the pace or power (ACSM equations) divided
 * by the share of the heart rate reserve used, as %HRR tracks %VO2 reserve (Swain 1997). Same
 * idea as Firstbeat's estimate, without its filtering of unsteady stretches: summary averages
 * only, so intervals and stops make it less exact.
 *
 * That alone rises the easier a session is. Per sport, the slope of estimate against intensity
 * over the last year moves every estimate to what it would read at VO2_REF_HRR, so a block of
 * easy runs does not show as gained fitness.
 */
export function vo2Efforts(uid: number, from: string, to: string): Vo2Effort[] {
  const calFrom = addDays(to, -VO2_CAL_DAYS);
  const raw = rawVo2Efforts(uid, from < calFrom ? from : calFrom, to);
  const slope = new Map<Vo2Effort["sport"], number>();
  for (const sport of ["run", "ride"] as const) {
    const cal = raw.filter((e) => e.sport === sport && e.date >= calFrom);
    if (cal.length < VO2_CAL_MIN_EFFORTS) continue;
    const xs = cal.map((e) => e.hrr);
    const ys = cal.map((e) => e.vo2max);
    if (sd(xs) < VO2_CAL_MIN_SD) continue;
    const mx = mean(xs);
    const my = mean(ys);
    const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    // Only ever a correction for the known bias, never a steep one from a few odd sessions.
    slope.set(sport, Math.max(-60, Math.min(0, b)));
  }
  return raw
    .filter((e) => e.date >= from)
    .map((e) => ({ ...e, vo2max: Math.round((e.vo2max - (slope.get(e.sport) ?? 0) * (e.hrr - VO2_REF_HRR)) * 10) / 10 }));
}

function rawVo2Efforts(uid: number, from: string, to: string): Vo2Effort[] {
  const { rhr, maxHr } = hrBounds(uid);
  const weights = metricSeries(uid, "weight", "0000-01-01", to);
  const weightOn = (date: string) => weights.findLast((w) => w.date <= date)?.value ?? weights[0]?.value ?? null;
  const rows = db
    .prepare("SELECT id, start_local, type, summary FROM activity WHERE user_id = ? AND substr(start_local, 1, 10) BETWEEN ? AND ? ORDER BY start_local")
    .all(uid, from, to) as { id: number; start_local: string; type: string | null; summary: string }[];
  const out: Vo2Effort[] = [];
  for (const r of rows) {
    const s = JSON.parse(r.summary);
    const durationS = s.movingDuration ?? s.duration ?? 0;
    const hr = s.averageHR;
    if (typeof hr !== "number" || hr < VO2_MIN_HR_SHARE * maxHr || maxHr <= rhr) continue;
    const hrr = (hr - rhr) / (maxHr - rhr);
    const type = r.type ?? "";
    const date = r.start_local.slice(0, 10);
    let vo2: number | null = null;
    let sport: Vo2Effort["sport"] = "run";
    if (/run/.test(type) && durationS >= VO2_MIN_RUN_S) {
      const gas = s.avgGradeAdjustedSpeed;
      const grade = s.distance ? (s.elevationGain ?? 0) / s.distance : 0;
      const speed = typeof gas === "number" ? gas : grade <= VO2_MAX_GRADE ? s.averageSpeed : null;
      if (typeof speed === "number" && speed > 0) vo2 = 3.5 + 0.2 * speed * 60;
    } else if (/cycl|bik|ride/.test(type) && !/e_bike/.test(type) && durationS >= VO2_MIN_RIDE_S && typeof s.avgPower === "number" && s.avgPower > 0) {
      const kg = weightOn(date);
      if (kg) {
        vo2 = 7 + (10.8 * s.avgPower) / kg;
        sport = "ride";
      }
    }
    if (vo2 === null) continue;
    const vo2max = 3.5 + (vo2 - 3.5) / hrr;
    // Outside human range: bad HR data, GPS glitch or a wrong max HR.
    if (vo2max < 15 || vo2max > 90) continue;
    out.push({ activityId: r.id, date, sport, vo2max, hrr });
  }
  return out;
}

/**
 * Median of the efforts in the window ending on each day, from the sport with more of them.
 * Running and cycling estimates differ (Garmin keeps two values too), so they are not mixed.
 */
function vo2ByDay(efforts: Vo2Effort[], dates: string[]): Map<string, { value: number; sport: Vo2Effort["sport"] } | null> {
  const out = new Map<string, { value: number; sport: Vo2Effort["sport"] } | null>();
  for (const d of dates) {
    const start = addDays(d, -(VO2_WINDOW_DAYS - 1));
    const inWin = efforts.filter((e) => e.date >= start && e.date <= d);
    const runs = inWin.filter((e) => e.sport === "run");
    const rides = inWin.filter((e) => e.sport === "ride");
    const pick = runs.length >= rides.length ? runs : rides;
    out.set(d, pick.length >= VO2_MIN_EFFORTS ? { value: Math.round(median(pick.map((e) => e.vo2max)) * 10) / 10, sport: pick[0].sport } : null);
  }
  return out;
}

// ---------- Status ----------

export type StatusKey =
  | "peaking"
  | "productive"
  | "maintaining"
  | "strained"
  | "unproductive"
  | "overreaching"
  | "recovery"
  | "detraining"
  | "none";

/** Garmin's HRV status from the 7-day average against the baseline ranges. */
export type HrvStatus = "balanced" | "unbalanced_high" | "unbalanced_low" | "low";

export interface StatusDay {
  date: string;
  status: StatusKey;
  /** 3-day average of the acute:chronic ratio. */
  acwr: number | null;
  tsb: number;
  ctl: number;
  /** Change of fitness (CTL) over the last 28 days, as a fraction. */
  ctlChange: number | null;
  vo2max: number | null;
  vo2Sport: Vo2Effort["sport"] | null;
  /** Change of the VO2max estimate over the last 21 days, ml/kg/min. */
  vo2Change: number | null;
  fitness: "up" | "flat" | "down" | null;
  hrv: HrvStatus | null;
  /** 3-day average resting HR clearly above the 60-day baseline. */
  rhrHigh: boolean | null;
  /** 3-night average sleep score below 60. */
  sleepPoor: boolean | null;
}

/** Below this, fitness is too small to judge: not enough training history yet. */
const MIN_CTL = 3;
const OVERREACHING_ACWR = 1.5;
const OVERREACHING_TSB = -10;
const LOW_ACWR = 0.8;
/** Fitness lost over 28 days that turns a light phase from recovery into detraining. */
const DETRAINING_DROP = -0.15;
/** Rise of fitness over 28 days that counts as building without a VO2max trend. */
const BUILDING_RISE = 0.05;

export function trainingStatus(uid: number, from: string, to: string): StatusDay[] {
  const load = trainingLoad(uid, addDays(from, -90), to);
  const byDate = new Map(load.map((l) => [l.date, l]));
  // A few days before `from`, so the first days already have a status to hold on to.
  const warm = addDays(from, -HOLD_DAYS);
  const dates = load.filter((l) => l.date >= warm).map((l) => l.date);

  const vo2 = vo2ByDay(vo2Efforts(uid, addDays(warm, -(VO2_WINDOW_DAYS + TREND_DAYS)), to), [
    ...new Set(dates.flatMap((d) => [d, addDays(d, -TREND_DAYS)])),
  ]);

  const seriesMap = (key: string, back: number) => new Map(metricSeries(uid, key, addDays(warm, -back), to).map((p) => [p.date, p.value]));
  const hrvWeek = seriesMap("hrv_weekly", 0);
  const hrvLo = seriesMap("hrv_base_low", 0);
  const hrvHi = seriesMap("hrv_base_high", 0);
  const hrvLowUpper = seriesMap("hrv.baseline.lowUpper", 0);
  const rhr = seriesMap("rhr", 63);
  const sleep = seriesMap("sleep_score", 3);

  const lastDays = (m: Map<string, number>, d: string, n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => m.get(addDays(d, -i - offset))).filter((v): v is number => v !== undefined);

  const raw = dates.map((date): StatusDay => {
    const l = byDate.get(date)!;
    const ago = byDate.get(addDays(date, -28));
    const ctlChange = ago && ago.ctl > MIN_CTL ? l.ctl / ago.ctl - 1 : null;
    const ctlPeak = Math.max(...load.filter((x) => x.date <= date && x.date >= addDays(date, -90)).map((x) => x.ctl));

    const now = vo2.get(date) ?? null;
    const before = vo2.get(addDays(date, -TREND_DAYS)) ?? null;
    const vo2Change = now && before && now.sport === before.sport ? Math.round((now.value - before.value) * 10) / 10 : null;
    const fitness = vo2Change === null ? null : vo2Change >= TREND_STEP ? "up" : vo2Change <= -TREND_STEP ? "down" : "flat";

    let hrv: HrvStatus | null = null;
    const wk = hrvWeek.get(date);
    const lo = hrvLo.get(date);
    const hi = hrvHi.get(date);
    if (wk !== undefined && lo !== undefined && hi !== undefined) {
      const lu = hrvLowUpper.get(date);
      hrv = lu !== undefined && wk < lu ? "low" : wk < lo ? "unbalanced_low" : wk > hi ? "unbalanced_high" : "balanced";
    }

    const rhrRecent = lastDays(rhr, date, 3);
    const rhrBase = lastDays(rhr, date, 60, 3);
    const rhrHigh =
      rhrRecent.length >= 2 && rhrBase.length >= 14 ? mean(rhrRecent) - mean(rhrBase) >= Math.max(3, sd(rhrBase)) : null;
    const sleepRecent = lastDays(sleep, date, 3);
    const sleepPoor = sleepRecent.length >= 2 ? mean(sleepRecent) < 60 : null;

    // Averaged over 3 days, so one big session does not flip the status back and forth.
    const ratios = [0, 1, 2].map((i) => byDate.get(addDays(date, -i))?.acwr).filter((v): v is number => typeof v === "number");
    const acwr = ratios.length ? mean(ratios) : null;

    const status = classify({ acwr, tsb: l.tsb, ctl: l.ctl, ctlPeak, ctlChange, fitness, hrv, rhrHigh, sleepPoor });
    return {
      date,
      status,
      acwr,
      tsb: l.tsb,
      ctl: l.ctl,
      ctlChange,
      vo2max: now?.value ?? null,
      vo2Sport: now?.sport ?? null,
      vo2Change,
      fitness,
      hrv,
      rhrHigh,
      sleepPoor,
    };
  });

  // A new state counts once it holds for HOLD_DAYS days, so values hovering at a threshold do
  // not flip it daily. Warnings show at once.
  let shown: StatusKey | null = null;
  const out: StatusDay[] = [];
  raw.forEach((d, i) => {
    const held = i >= HOLD_DAYS - 1 && raw.slice(i - HOLD_DAYS + 1, i).every((p) => p.status === d.status);
    if (shown === null || WARNINGS.has(d.status) || held) shown = d.status;
    if (d.date >= from) out.push({ ...d, status: shown });
  });
  return out;
}

const HOLD_DAYS = 2;
const WARNINGS = new Set<StatusKey>(["overreaching", "strained", "none"]);

/** First match wins: warnings before the load-based states. */
export function classify(x: {
  acwr: number | null;
  tsb: number;
  ctl: number;
  ctlPeak: number;
  ctlChange: number | null;
  fitness: StatusDay["fitness"];
  hrv: HrvStatus | null;
  rhrHigh: boolean | null;
  sleepPoor: boolean | null;
}): StatusKey {
  if (x.ctl < MIN_CTL || x.acwr === null) return "none";
  // The ratio alone jumps after any break; only with real fatigue behind it is it overreaching.
  if (x.acwr > OVERREACHING_ACWR && x.tsb <= OVERREACHING_TSB) return "overreaching";
  // Recovery is held back no matter the load: HRV well below normal, or two signals at once.
  const hrvDown = x.hrv === "low" || x.hrv === "unbalanced_low";
  if (x.hrv === "low" || (hrvDown && (x.rhrHigh || x.sleepPoor)) || (x.rhrHigh && x.sleepPoor)) return "strained";
  if (x.acwr < LOW_ACWR) {
    if (x.ctlChange !== null && x.ctlChange <= DETRAINING_DROP && x.fitness !== "up") return "detraining";
    // A taper: fresh after a block, fitness near its high and not falling.
    if (x.acwr >= 0.6 && x.tsb >= 5 && x.tsb <= 25 && x.ctl >= 0.9 * x.ctlPeak && x.fitness !== "down") return "peaking";
    return "recovery";
  }
  if (x.fitness === "up") return "productive";
  if (x.fitness === "down") return "unproductive";
  if (x.fitness === null && x.ctlChange !== null && x.ctlChange >= BUILDING_RISE) return "productive";
  return "maintaining";
}
