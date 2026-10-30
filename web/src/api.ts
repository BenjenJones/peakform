import { useEffect, useState } from "react";

// Relative URLs on purpose: under HA ingress the app lives at a dynamic prefix.
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`api/${path}`, init);
  if (res.status === 401 && !path.startsWith("auth/")) dispatchEvent(new Event("unauthenticated"));
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    let code: string | undefined;
    try {
      const json = JSON.parse(body);
      msg = json.error ?? body;
      code = json.code;
    } catch {}
    throw new ApiError(res.status, msg, code);
  }
  return res.json();
}

export const send = <T = unknown>(path: string, method: string, body?: unknown) =>
  api<T>(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export interface Me {
  id: number;
  username: string;
  displayName: string | null;
  mode: "homeassistant" | "local";
  garminKey: { updated_at: string; last_error: string | null } | null;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setError(null);
    api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [path, ...deps]);
  return { data, error };
}

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export interface Point { date: string; value: number }
export type SeriesMap = Record<string, Point[]>;

export interface LoadDay { date: string; load: number; ctl: number; atl: number; tsb: number; acwr: number | null }

export interface ActivityLite {
  id: number; date: string; start: string; type: string; name: string;
  durationS: number; distanceM: number | null; avgHr: number | null; maxHr: number | null;
  avgPower: number | null; elevGainM: number | null; load: number; loadSource: string;
}

export interface Readiness {
  score: number | null;
  parts: { key: string; today: number; baseline: number; z: number }[];
}

export interface DayMetric {
  value: number | null;
  avg7: number | null;
  baseline: { mean: number; sd: number } | null;
  trend: Point[];
}

export interface DayData {
  date: string;
  first: string | null;
  last: string | null;
  metrics: Record<string, DayMetric>;
  intensityWeek: number;
  readiness: Readiness;
  load: LoadDay[];
  activities: ActivityLite[];
}

/** Sleep window and overnight heart rate; times are local wall clock encoded as UTC epoch ms. */
export interface Night {
  start: number;
  end: number;
  hr: [number, number][];
  hrError: string | null;
}

export interface Streams {
  t: number[]; hr: (number | null)[]; power: (number | null)[]; speed: (number | null)[];
  cadence: (number | null)[]; alt: (number | null)[]; dist: (number | null)[];
  lat: (number | null)[]; lon: (number | null)[];
}

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
export const fmtCurveDuration = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`);
export const fmtPace = (mps: number) => (mps > 0 ? fmtDuration(1000 / mps) + " /km" : "–");
export const label = (s: string) => s.replace(/_/g, " ");
