import { activityStreams, hrLimitFor, isRun, withStepCadence } from "./analytics.js";
import { db } from "./db.js";
import type { Streams } from "./garmin/fit.js";

// Two activities over the same route on one distance axis, so the same spot of the course
// lines up even when one run was faster. Each keeps its own measured distance: if GPS measured
// one longer, it simply ends further right.

/** Slower than this between two records counts as standing (traffic light, auto-pause gap). */
const MOVING_MPS = 0.5;
const MAX_POINTS = 2000;
/** Rolling window for pace/power, which are too noisy per bin. */
const SMOOTH_M = 100;

const SIMILAR_DISTANCE = 0.07;
const SIMILAR_RADIUS_M = 300;
const MAX_OTHERS = 100;

interface Row {
  id: number;
  start_local: string;
  type: string | null;
  name: string | null;
  summary: string;
}

export interface CompareSide {
  id: number;
  name: string;
  type: string;
  start: string;
  distanceM: number;
  movingS: number;
  avgHr: number | null;
  avgPower: number | null;
  elevGainM: number | null;
}

export interface Split {
  km: number;
  lengthM: number;
  timeS: number;
  avgHr: number | null;
}

interface Profile {
  /** Moving seconds to reach each grid point; null past the activity's end. */
  time: (number | null)[];
  hr: (number | null)[];
  /** Steps per minute for runs, rpm otherwise. */
  cadence: (number | null)[];
  speed: (number | null)[];
  power: (number | null)[];
  alt: (number | null)[];
  /** Null throughout without GPS (treadmill, indoor). */
  lat: (number | null)[];
  lon: (number | null)[];
}

export interface Comparison {
  a: CompareSide;
  b: CompareSide;
  /** Grid in km up to the longer of the two distances. */
  x: number[];
  /** Seconds A is ahead of B at each grid point (negative: behind); null past the shorter one's end. */
  delta: (number | null)[];
  /** Seconds A is ahead at the end of the shorter of the two. */
  lead: number;
  /** Upper heart rate limit set for A's sport. */
  hrLimit: number | null;
  profiles: { a: Profile; b: Profile };
  splits: { a: Split[]; b: Split[] };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function side(r: Row, track: Track): CompareSide {
  const sum = JSON.parse(r.summary);
  return {
    id: r.id,
    name: r.name ?? "",
    type: r.type ?? "other",
    start: r.start_local,
    distanceM: track.total,
    movingS: track.moving.at(-1) ?? 0,
    avgHr: num(sum.averageHR),
    avgPower: num(sum.avgPower),
    elevGainM: num(sum.elevationGain),
  };
}

/** Distance (forward-filled) and cumulative moving time per record. */
interface Track {
  dist: number[];
  moving: number[];
  total: number;
}

function track(s: Streams): Track {
  const dist: number[] = [];
  const moving: number[] = [];
  let d = 0;
  let m = 0;
  for (let i = 0; i < s.t.length; i++) {
    const next = Math.max(d, s.dist[i] ?? d);
    if (i > 0) {
      const dt = s.t[i] - s.t[i - 1];
      if (dt > 0 && (next - d) / dt >= MOVING_MPS) m += dt;
    }
    d = next;
    dist.push(d);
    moving.push(m);
  }
  return { dist, moving, total: d };
}

/** Linear interpolation of `ys` at position `x` along ascending `xs`, using a moving cursor. */
function interpolator(xs: number[], ys: number[]) {
  let j = 0;
  return (x: number) => {
    while (j < xs.length - 1 && xs[j + 1] < x) j++;
    if (j >= xs.length - 1) return ys[xs.length - 1] ?? 0;
    const x0 = xs[j];
    const x1 = xs[j + 1];
    return x1 > x0 ? ys[j] + ((ys[j + 1] - ys[j]) * (x - x0)) / (x1 - x0) : ys[j + 1];
  };
}

/** Mean of a stream per grid bin; empty bins (sparse recording) repeat the previous value. */
function binned(pos: number[], v: (number | null)[], grid: number[], step: number, skipZero: boolean) {
  const sums = new Float64Array(grid.length);
  const counts = new Uint32Array(grid.length);
  for (let i = 0; i < pos.length; i++) {
    const x = v[i];
    if (x === null || (skipZero && x <= 0)) continue;
    const k = Math.min(grid.length - 1, Math.max(0, Math.round(pos[i] / step)));
    sums[k] += x;
    counts[k]++;
  }
  const out: (number | null)[] = [];
  let last: number | null = null;
  for (let k = 0; k < grid.length; k++) {
    if (counts[k]) last = sums[k] / counts[k];
    out.push(last);
  }
  return out;
}

const round6 = (v: number | null) => (v === null ? null : +v.toFixed(6));

function smooth(v: (number | null)[], radius: number) {
  return v.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(v.length - 1, i + radius); j++) {
      if (v[j] !== null) {
        sum += v[j] as number;
        n++;
      }
    }
    return n ? sum / n : null;
  });
}

function profile(s: Streams, tr: Track, grid: number[], step: number): Profile {
  const pos = tr.dist;
  const at = interpolator(pos, tr.moving);
  const radius = Math.max(1, Math.round(SMOOTH_M / 2 / step));
  // Bins past the end would otherwise repeat the last value.
  const end = Math.ceil(tr.total / step);
  const cut = <T,>(v: (T | null)[]) => v.map((x, k) => (k <= end ? x : null));
  return {
    time: cut(grid.map((x) => Math.round(at(x)))),
    hr: cut(binned(pos, s.hr, grid, step, true)),
    cadence: cut(smooth(binned(pos, s.cadence, grid, step, true), radius)),
    speed: cut(smooth(binned(pos, s.speed, grid, step, true), radius)),
    power: cut(smooth(binned(pos, s.power, grid, step, true), radius)),
    alt: cut(binned(pos, s.alt, grid, step, false)),
    lat: cut(binned(pos, s.lat, grid, step, false).map(round6)),
    lon: cut(binned(pos, s.lon, grid, step, false).map(round6)),
  };
}

/** Kilometre splits on the activity's own distance, by moving time. */
function splits(s: Streams, tr: Track): Split[] {
  const at = interpolator(tr.dist, tr.moving);
  const out: Split[] = [];
  let i = 0;
  for (let from = 0, km = 1; from < tr.total - 50; from += 1000, km++) {
    const to = Math.min(from + 1000, tr.total);
    const hrs: number[] = [];
    while (i < tr.dist.length && tr.dist[i] <= to) {
      const h = s.hr[i];
      if (tr.dist[i] > from && h) hrs.push(h);
      i++;
    }
    out.push({
      km,
      lengthM: to - from,
      timeS: Math.round(at(to) - at(from)),
      avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    });
  }
  return out;
}

const getRow = (uid: number, id: number) =>
  db.prepare("SELECT id, start_local, type, name, summary FROM activity WHERE user_id = ? AND id = ?").get(uid, id) as Row | undefined;

export function compareActivities(uid: number, idA: number, idB: number): Comparison | null {
  const ra = getRow(uid, idA);
  const rb = getRow(uid, idB);
  const rawA = ra && activityStreams(uid, idA);
  const rawB = rb && activityStreams(uid, idB);
  if (!ra || !rb || !rawA || !rawB) return null;
  const sa = isRun(ra.type) ? withStepCadence(rawA) : rawA;
  const sb = isRun(rb.type) ? withStepCadence(rawB) : rawB;
  const ta = track(sa);
  const tb = track(sb);
  // Distance is the shared axis: without it there is nothing to align.
  if (ta.total < 100 || tb.total < 100) return null;

  const total = Math.max(ta.total, tb.total);
  const step = Math.max(10, Math.ceil(total / MAX_POINTS / 10) * 10);
  const grid: number[] = [];
  for (let x = 0; x < total; x += step) grid.push(x);
  grid.push(total);

  const a = profile(sa, ta, grid, step);
  const b = profile(sb, tb, grid, step);
  const shared = Math.min(ta.total, tb.total);
  return {
    a: side(ra, ta),
    b: side(rb, tb),
    x: grid.map((x) => Math.round(x) / 1000),
    delta: grid.map((x, k) => (x <= shared && a.time[k] !== null && b.time[k] !== null ? b.time[k] - a.time[k] : null)),
    lead: Math.round(interpolator(tb.dist, tb.moving)(shared) - interpolator(ta.dist, ta.moving)(shared)),
    hrLimit: hrLimitFor(uid, ra.type),
    profiles: { a, b },
    splits: { a: splits(sa, ta), b: splits(sb, tb) },
  };
}

// ---------- Candidates ----------

export interface Candidate {
  id: number;
  name: string;
  start: string;
  distanceM: number | null;
  movingS: number | null;
}

/** Great-circle distance in metres. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/**
 * Same sport, split into likely the same route (similar distance, same start and finish)
 * and everything else. Without GPS (treadmill, rowing) only the distance has to match.
 */
export function compareCandidates(uid: number, id: number): { similar: Candidate[]; others: Candidate[] } | null {
  const ref = getRow(uid, id);
  if (!ref) return null;
  const rs = JSON.parse(ref.summary);
  const rows = db
    .prepare("SELECT id, start_local, type, name, summary FROM activity WHERE user_id = ? AND type IS ? AND id != ? ORDER BY start_local DESC")
    .all(uid, ref.type, id) as unknown as Row[];

  const near = (s: Record<string, unknown>, lat: string, lon: string) => {
    const [a1, o1, a2, o2] = [num(rs[lat]), num(rs[lon]), num(s[lat]), num(s[lon])];
    if (a1 === null || o1 === null || a2 === null || o2 === null) return a1 === null && a2 === null;
    return haversine(a1, o1, a2, o2) <= SIMILAR_RADIUS_M;
  };

  const similar: Candidate[] = [];
  const others: Candidate[] = [];
  for (const r of rows) {
    const s = JSON.parse(r.summary);
    const c = { id: r.id, name: r.name ?? "", start: r.start_local, distanceM: num(s.distance), movingS: num(s.movingDuration) ?? num(s.duration) };
    const rd = num(rs.distance);
    const sameDistance = !!rd && !!c.distanceM && Math.abs(c.distanceM - rd) / rd <= SIMILAR_DISTANCE;
    if (sameDistance && near(s, "startLatitude", "startLongitude") && near(s, "endLatitude", "endLongitude")) similar.push(c);
    else if (others.length < MAX_OTHERS) others.push(c);
  }
  return { similar, others };
}
