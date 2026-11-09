import { unpackJson } from "./codec.js";
import { db, kvSet } from "./db.js";
import type { GarminClient } from "./garmin/client.js";
import { addDays, fetchHeartRateDay, parseStamp } from "./night.js";

// Garmin reports one resting heart rate per day, taken from the lowest 30 minutes of the 24 hours,
// which nearly always fall into sleep. Night and day values come from the 2-minute samples instead.

type Sample = [number, number];
type Span = [number, number];

const WINDOW_MS = 30 * 60_000;
/** Of the 15 samples a full window holds: short gaps are fine, a mostly empty window is not. */
const MIN_SAMPLES = 12;
/** Around sleep and naps: lying in bed still reads like sleep, not like the waking day. */
const MARGIN_MS = 30 * 60_000;
/** Heart rate fetches per sync, so a big backfill spreads over several syncs. */
const MAX_DAYS_PER_RUN = 200;
/** Days back from today whose values can no longer change. */
const SETTLED_DAYS = 2;

export interface SleepRecord {
  calendarDate?: string;
  sleepStartTimestampGMT?: number | null;
  sleepEndTimestampGMT?: number | null;
  dailyNapDTOS?: { napStartTimestampGMT?: string; napEndTimestampGMT?: string }[] | null;
}

export interface RestingHr {
  night: number | null;
  day: number | null;
}

/** Lowest average over any 30-minute window, rounded like Garmin's own value. Samples sorted by time. */
export function lowestAverage(samples: Sample[]): number | null {
  let best: number | null = null;
  let sum = 0;
  let from = 0;
  for (let to = 0; to < samples.length; to++) {
    sum += samples[to][1];
    while (samples[to][0] - samples[from][0] >= WINDOW_MS) sum -= samples[from++][1];
    const n = to - from + 1;
    if (n >= MIN_SAMPLES && (best === null || sum / n < best)) best = sum / n;
  }
  return best === null ? null : Math.round(best);
}

function sleepSpan(s: SleepRecord | undefined): Span | null {
  return s?.sleepStartTimestampGMT && s.sleepEndTimestampGMT ? [s.sleepStartTimestampGMT, s.sleepEndTimestampGMT] : null;
}

/**
 * Night: the sleep that ended on this calendar day, which usually began on the day before.
 * Day: this calendar day's samples outside that sleep, its naps and the sleep beginning that evening.
 */
export function restingHrFor(previous: Sample[], today: Sample[], sleep: SleepRecord | undefined, nextSleep: SleepRecord | undefined): RestingHr {
  const byTime = (a: Sample, b: Sample) => a[0] - b[0];
  const night = sleepSpan(sleep);
  const naps = (sleep?.dailyNapDTOS ?? [])
    .map((n): Span => [parseStamp(n.napStartTimestampGMT), parseStamp(n.napEndTimestampGMT)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const asleep = [night, sleepSpan(nextSleep), ...naps].filter((s): s is Span => s !== null);

  const nightSamples = night ? [...previous, ...today].filter(([ts]) => ts >= night[0] && ts <= night[1]).sort(byTime) : [];
  const awake = today.filter(([ts]) => !asleep.some(([a, b]) => ts >= a - MARGIN_MS && ts <= b + MARGIN_MS)).sort(byTime);
  return { night: lowestAverage(nightSamples), day: lowestAverage(awake) };
}

function sleepByDate(uid: number) {
  const rows = db.prepare("SELECT payload FROM raw_range WHERE user_id = ? AND endpoint = 'sleep_summaries' ORDER BY fetched_at").all(uid) as {
    payload: Uint8Array;
  }[];
  const out = new Map<string, SleepRecord>();
  for (const { payload } of rows) {
    const list = unpackJson<unknown>(payload);
    for (const s of (Array.isArray(list) ? list : [list]) as SleepRecord[]) if (s?.calendarDate) out.set(s.calendarDate, s);
  }
  return out;
}

/** Compute the values still open, newest first. Stored apart from raw_range, which holds no samples. */
export async function syncRestingHr(uid: number, client: GarminClient, onStep: (step: string) => void) {
  const settled = addDays(new Date().toISOString().slice(0, 10), -SETTLED_DAYS);
  const stored = db.prepare("SELECT key FROM user_kv WHERE user_id = ? AND key LIKE 'resthr:%'").all(uid) as { key: string }[];
  const done = new Set(stored.map((r) => r.key.slice("resthr:".length)));
  const sleeps = sleepByDate(uid);
  const pending = [...sleeps.keys()].filter((d) => d > settled || !done.has(d)).sort().reverse();

  const samples = new Map<string, Sample[]>();
  const load = async (date: string) => {
    let values = samples.get(date);
    if (!values) samples.set(date, (values = (await fetchHeartRateDay(client, date)).values.filter(([, bpm]) => bpm > 0)));
    return values;
  };

  for (const date of pending) {
    if (samples.size >= MAX_DAYS_PER_RUN) break;
    onStep(`resting heart rate ${date}`);
    const today = await load(date);
    const previous = await load(addDays(date, -1));
    kvSet(uid, `resthr:${date}`, restingHrFor(previous, today, sleeps.get(date), sleeps.get(addDays(date, 1))));
  }
}
