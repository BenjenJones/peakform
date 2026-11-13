import { useMemo } from "react";
import { fmtPace, type Streams } from "./api";
import { fmtNum } from "./i18n";
import type { LatLon } from "./RouteMap";

// Colours the route by one value at a time. Magnitudes (pace, heart rate, cadence) use one hue from
// light to dark, grade a diverging scale with a grey midpoint: blue downhill, red uphill.

export type RouteLayer = "pace" | "hr" | "cadence" | "grade";
export const ROUTE_LAYERS: RouteLayer[] = ["pace", "hr", "cadence", "grade"];

/** Colour steps; CSS classes rl-0…rl-6 (sequential) and rg-0…rg-6 (diverging), see styles.css. */
const STEPS = 7;

/** Polylines per colour step, drawn above the plain route. */
export type Overlay = { cls: string; lines: LatLon[][] }[];

export interface Legend {
  diverging: boolean;
  low: string;
  high: string;
}

/** Below this the watch is standing still; pace and cadence there would only skew the scale. */
const MIN_SPEED = 0.5;
/** Grade over this distance either side: altitude is too noisy from one second to the next. */
const GRADE_HALF_M = 40;

/** Grade in % per sample, over ±40 m of distance; null where altitude or distance is missing. */
export function grades(s: Streams): (number | null)[] {
  const idx = s.t.map((_, i) => i).filter((i) => s.dist[i] != null && s.alt[i] != null);
  const out: (number | null)[] = s.t.map(() => null);
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < idx.length; k++) {
    const d = s.dist[idx[k]]!;
    while (s.dist[idx[lo]]! < d - GRADE_HALF_M) lo++;
    while (hi + 1 < idx.length && s.dist[idx[hi + 1]]! <= d + GRADE_HALF_M) hi++;
    const run = s.dist[idx[hi]]! - s.dist[idx[lo]]!;
    if (run >= GRADE_HALF_M / 2) out[idx[k]] = ((s.alt[idx[hi]]! - s.alt[idx[lo]]!) / run) * 100;
  }
  return out;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/** Which layers have data in these streams. */
export function availableLayers(s: Streams, hasHrr: boolean): RouteLayer[] {
  const any = (v: (number | null)[]) => v.some((x) => (x ?? 0) > 0);
  return ROUTE_LAYERS.filter((l) =>
    l === "pace" ? any(s.speed) : l === "hr" ? hasHrr && any(s.hr) : l === "cadence" ? any(s.cadence) : s.alt.some((x) => x != null) && any(s.dist),
  );
}

export function useRouteLayer(
  s: Streams | null,
  layer: RouteLayer | null,
  opts: { run: boolean; hrr: { rhr: number; maxHr: number } | null; spm: string; pctHrr: string },
): { overlay: Overlay | null; legend: Legend | null } {
  return useMemo(() => {
    if (!s || !layer) return { overlay: null, legend: null };
    const { run, hrr } = opts;
    const moving = (i: number) => (s.speed[i] ?? MIN_SPEED) >= MIN_SPEED;
    let values: (number | null)[];
    if (layer === "pace") values = s.speed.map((v) => (v != null && v >= MIN_SPEED ? v : null));
    else if (layer === "hr") values = hrr ? s.hr.map((h) => (h ? ((h - hrr.rhr) / (hrr.maxHr - hrr.rhr)) * 100 : null)) : [];
    else if (layer === "cadence") values = s.cadence.map((c, i) => (c && c > 0 && moving(i) ? c : null));
    else values = grades(s);

    const present = values.filter((v): v is number => v != null).sort((a, b) => a - b);
    if (!present.length) return { overlay: null, legend: null };
    const diverging = layer === "grade";
    let lo: number;
    let hi: number;
    if (diverging) {
      // Symmetric around 0 so flat stays grey; at least ±4 %, at most ±15 %.
      const a = Math.min(15, Math.max(4, quantile(present.map(Math.abs).sort((x, y) => x - y), 0.95)));
      lo = -a;
      hi = a;
    } else {
      // 5th to 95th percentile: a few spikes (GPS jumps, a sprint at the end) would flatten the rest.
      lo = quantile(present, 0.05);
      hi = quantile(present, 0.95);
      if (hi - lo < 1e-6) hi = lo + 1;
    }
    const step = (v: number) => Math.min(STEPS - 1, Math.max(0, Math.round(((v - lo) / (hi - lo)) * (STEPS - 1))));
    const prefix = diverging ? "rg-" : "rl-";

    // Consecutive segments of the same step become one line, so a long ride stays a few hundred paths.
    const groups = new Map<string, LatLon[][]>();
    let current: LatLon[] | null = null;
    let currentCls = "";
    for (let i = 0; i + 1 < s.t.length; i++) {
      const a = s.lat[i] != null && s.lon[i] != null ? ([s.lat[i]!, s.lon[i]!] as LatLon) : null;
      const b = s.lat[i + 1] != null && s.lon[i + 1] != null ? ([s.lat[i + 1]!, s.lon[i + 1]!] as LatLon) : null;
      if (!a || !b) {
        current = null;
        continue;
      }
      const v = values[i];
      const cls = v == null ? "rl-none" : prefix + step(v);
      if (current && cls === currentCls) current.push(b);
      else {
        current = [a, b];
        currentCls = cls;
        if (!groups.has(cls)) groups.set(cls, []);
        groups.get(cls)!.push(current);
      }
    }
    const overlay = [...groups].map(([cls, lines]) => ({ cls, lines }));

    const fmt = (v: number) => {
      if (layer === "pace") return run ? fmtPace(v) : `${fmtNum(v * 3.6, 1)} km/h`;
      if (layer === "hr") return `${fmtNum(v)} ${opts.pctHrr} (${fmtNum(hrr!.rhr + (v / 100) * (hrr!.maxHr - hrr!.rhr))} bpm)`;
      if (layer === "cadence") return `${fmtNum(v)} ${run ? opts.spm : "rpm"}`;
      return `${v > 0 ? "+" : ""}${fmtNum(v)} %`;
    };
    return { overlay, legend: { diverging, low: fmt(lo), high: fmt(hi) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, layer, opts.run, opts.hrr?.rhr, opts.hrr?.maxHr, opts.spm, opts.pctHrr]);
}
