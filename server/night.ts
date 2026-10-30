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

/** [GMT epoch ms, bpm] samples for one calendar day; null readings dropped. */
async function heartRateDay(uid: number, client: GarminClient, date: string): Promise<[number, number][]> {
  const key = `hr:${date}`;
  const cached = kvGet<[number, number][]>(uid, key);
  if (cached) return cached;
  const res = await client.get<{ heartRateValues?: [number, number | null][] | null }>(dailyHeartRate, { date });
  const values = (res?.heartRateValues ?? []).filter((v): v is [number, number] => typeof v?.[1] === "number");
  if (date <= addDays(new Date().toISOString().slice(0, 10), -SETTLED_DAYS)) kvSet(uid, key, values);
  return values;
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
      for (const [ts, bpm] of await heartRateDay(uid, client, day)) {
        if (ts >= startGmt - MARGIN_MS && ts <= endGmt + MARGIN_MS) out.hr.push([ts + offset, bpm]);
      }
    }
  } catch (e) {
    out.hrError = (e as Error).message;
  }
  return out;
}
