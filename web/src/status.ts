import type { DayMetric, Point } from "./api";
import type { Key, T } from "./i18n";

/**
 * Whether a tile's value is good, fine or worth a look, against a range.
 *
 * Inside the range is "ok" ("good" for a goal, or a fixed range with a better side). Outside on the better side is "good". Outside on the worse side (or on
 * either side when no direction is better) is "warn" up to `soft` beyond the edge, "bad" further out.
 */
export type Tone = "good" | "ok" | "warn" | "bad";

export interface Judge {
  lo: number;
  hi: number;
  better?: "up" | "down";
  /** Distance beyond the range that is only a warning; Infinity: never "bad". */
  soft: number;
  /** "personal": the user's own last 60 days; "ref": a fixed reference; "goal": a target to reach. */
  source: "personal" | "ref" | "goal";
  /** Tooltip text naming the source, with {range}; otherwise one per `source`. */
  hint?: Key;
}

export interface Status {
  tone: Tone;
  /** Short word for the tile. */
  word: string;
  /** Longer text for the tooltip: the range and where it comes from. */
  hint: string;
}

export const TONE_COLOR: Record<Tone, string> = {
  good: "var(--good)",
  ok: "var(--s3)",
  warn: "var(--warning)",
  bad: "var(--critical)",
};

/** Fixed range, e.g. SpO2 95–100 %. */
export const fixed = (lo: number, hi: number, soft: number, better?: "up" | "down"): Judge => ({ lo, hi, soft, better, source: "ref" });
/** A goal to reach: below is only ever a warning. */
export const goal = (g: number): Judge => ({ lo: g, hi: Infinity, soft: Infinity, better: "up", source: "goal" });

// Fixed ranges where a common reference exists; every other tile with a "better" direction is
// judged against the user's own last 60 days (`personal`).
/** Garmin: 80+ good, 60–79 fair, below 60 poor. */
export const SLEEP_SCORE = fixed(80, 100, 20, "up");
/** Body Battery at its daily high: 75+ well charged, below 50 poorly. */
export const BB_HIGH = fixed(75, 100, 25, "up");
/** Garmin's rest zone is 0–25; 26–50 is low stress. */
export const SLEEP_STRESS = fixed(0, 25, 25, "down");
export const SPO2 = fixed(95, 100, 5, "up");
export const BMI = fixed(18.5, 25, 5);
/** Acute:chronic workload ratio: 0.8–1.3 is the usual sweet spot, above 1.5 the injury risk climbs. */
export const ACWR = fixed(0.8, 1.3, 0.2);
/** Form (TSB): below −30 is overreaching, far above 25 means fitness is fading. */
export const TSB = fixed(-30, 25, 10);

/**
 * The user's usual range: mean ± one standard deviation of the 60 days before. At least a few
 * percent wide, so a very steady metric does not flag every small wobble.
 */
export function personal(m: DayMetric, better?: "up" | "down"): Judge | null {
  if (!m.baseline) return null;
  const { mean, sd } = m.baseline;
  const w = Math.max(sd, Math.abs(mean) * 0.03, 0.5);
  return { lo: mean - w, hi: mean + w, soft: w, better, source: "personal" };
}

/** Same as `personal`, from a plain series (Overview): every point before the latest one. */
export function personalFrom(s: Point[], better?: "up" | "down"): Judge | null {
  const before = s.slice(0, -1).map((p) => p.value);
  if (before.length < 14) return null;
  const mean = before.reduce((a, v) => a + v, 0) / before.length;
  const sd = Math.sqrt(before.reduce((a, v) => a + (v - mean) ** 2, 0) / before.length);
  return personal({ value: null, avg7: null, trend: [], baseline: { mean, sd } }, better);
}

export function judge(v: number, j: Judge, t: T, fmt: (v: number) => string): Status {
  const range = j.hi === Infinity ? `≥ ${fmt(j.lo)}` : `${fmt(j.lo)}–${fmt(j.hi)}`;
  const hint = t(j.hint ?? (j.source === "personal" ? "status.hintPersonal" : j.source === "goal" ? "status.hintGoal" : "status.hintRef"), { range });
  const out = (tone: Tone, word: Key): Status => ({ tone, word: t(word), hint });

  if (v >= j.lo && v <= j.hi) {
    if (j.source === "goal") return out("good", "status.goal");
    // A fixed range with a better side is the good zone (sleep score 80+), not just the usual.
    return j.source === "ref" && j.better ? out("good", "status.good") : out("ok", "status.normal");
  }
  const high = v > j.hi;
  if (j.source === "goal") return out("warn", "status.short");
  if ((high && j.better === "up") || (!high && j.better === "down")) return out("good", high ? "status.high" : "status.low");
  const beyond = high ? v - j.hi : j.lo - v;
  return out(beyond <= j.soft ? "warn" : "bad", high ? "status.high" : "status.low");
}
