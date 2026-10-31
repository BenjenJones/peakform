import { unpackJson } from "./codec.js";
import { db, kvGet, kvSet } from "./db.js";
import { GarminClient } from "./garmin/client.js";
import { dailyHeartRate } from "./garmin/endpoints.js";
import { loadApiKey } from "./users.js";

// The Personal API has no per-stage sleep timeline (Oct 2026: dailySleep carries the same
// totals as the summaries). The night view pairs the sleep window with the 2-minute heart rate.

/** Heart rate around the sleep window, so falling asleep and waking stay visible. */
const MARGIN_MS = 30 * 60_000;
/** Days back from today whose heart rate is final and safe to cache. */
const SETTLED_DAYS = 2;

interface SleepSummary {
  calendarDate?: string;
  sleepStartTimestampGMT?: number | null;
  sleepEndTimestampGMT?: number | null;
  sleepStartTimestampLocal?: number | null;
}

export interface Night {
  /** Epoch ms shifted to the wearer's local time: format as UTC to get the wall clock. */
  start: number;
  end: number;
  hr: [number, number][];
  hrError: string | null;
}

const addDays = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function sleepSummary(uid: number, date: string): SleepSummary | null {
  const row = db
    .prepare(
      "SELECT payload FROM raw_range WHERE user_id = ? AND endpoint = 'sleep_summaries' AND start_date <= ? AND end_date >= ? ORDER BY fetched_at DESC LIMIT 1",
    )
    .get(uid, date, date) as { payload: Uint8Array } | undefined;
  if (!row) return null;
  const payload = unpackJson<unknown>(row.payload);
  const list = (Array.isArray(payload) ? payload : [payload]) as SleepSummary[];
  return list.find((s) => s?.calendarDate === date) ?? null;
}

interface HrDay {
  /** [GMT epoch ms, bpm]; null readings dropped. */
  values: [number, number][];
  /** Local minus GMT in ms for this day, when Garmin says. */
  offset: number | null;
}

/** "2026-10-30T23:00:00.0" as epoch ms, read as UTC. */
const parseStamp = (s: unknown) => (typeof s === "string" ? Date.parse(s.slice(0, 19) + "Z") : NaN);

/** 2-minute heart rate samples for one calendar day. */
async function heartRateDay(uid: number, client: GarminClient, date: string): Promise<HrDay> {
  const key = `hrday:${date}`;
  const cached = kvGet<HrDay>(uid, key);
  if (cached) return cached;
  const res = await client.get<{
    heartRateValues?: [number, number | null][] | null;
    startTimestampGMT?: string;
    startTimestampLocal?: string;
  }>(dailyHeartRate, { date });
  const values = (res?.heartRateValues ?? []).filter((v): v is [number, number] => typeof v?.[1] === "number");
  const offset = parseStamp(res?.startTimestampLocal) - parseStamp(res?.startTimestampGMT);
  const out: HrDay = { values, offset: Number.isFinite(offset) ? offset : null };
  if (date <= addDays(new Date().toISOString().slice(0, 10), -SETTLED_DAYS)) kvSet(uid, key, out);
  return out;
}

export interface DayHr {
  /** [local-as-UTC epoch ms, bpm] from midnight to midnight. */
  hr: [number, number][];
  error: string | null;
}

/** Heart rate over one calendar day, on the wearer's wall clock. Null without an API key. */
export async function dayHeartRate(uid: number, date: string): Promise<DayHr | null> {
  const apiKey = loadApiKey(uid);
  if (!apiKey) return null;
  const client = new GarminClient(uid, apiKey);
  try {
    const day = await heartRateDay(uid, client, date);
    const s = sleepSummary(uid, date);
    const offset = day.offset ?? (s?.sleepStartTimestampLocal && s.sleepStartTimestampGMT ? s.sleepStartTimestampLocal - s.sleepStartTimestampGMT : 0);
    const from = Date.parse(date + "T00:00:00Z");
    const to = from + 86_400_000;
    const hr = day.values.map(([ts, bpm]): [number, number] => [ts + offset, bpm]).filter(([ts]) => ts >= from && ts < to);
    return { hr, error: null };
  } catch (e) {
    return { hr: [], error: (e as Error).message };
  }
}

export async function night(uid: number, date: string): Promise<Night | null> {
  const s = sleepSummary(uid, date);
  if (!s?.sleepStartTimestampGMT || !s.sleepEndTimestampGMT) return null;
  const startGmt = s.sleepStartTimestampGMT;
  const endGmt = s.sleepEndTimestampGMT;
  const offset = s.sleepStartTimestampLocal ? s.sleepStartTimestampLocal - startGmt : 0;
  const out: Night = { start: startGmt + offset, end: endGmt + offset, hr: [], hrError: null };

  const apiKey = loadApiKey(uid);
  if (!apiKey) return out;
  const client = new GarminClient(uid, apiKey);
  try {
    // Nights usually start on the previous calendar day.
    const days = startGmt + offset < Date.parse(date + "T00:00:00Z") ? [addDays(date, -1), date] : [date];
    for (const day of days) {
      for (const [ts, bpm] of (await heartRateDay(uid, client, day)).values) {
        if (ts >= startGmt - MARGIN_MS && ts <= endGmt + MARGIN_MS) out.hr.push([ts + offset, bpm]);
      }
    }
  } catch (e) {
    out.hrError = (e as Error).message;
  }
  return out;
}
