import type { Point } from "./api";

/**
 * Small picture at the foot of a value tile. Each kind suits a type of metric, so tiles side by side
 * look different at a glance instead of all carrying the same sparkline:
 * - line: a level that drifts (heart rate, HRV over the week, fitness).
 * - bars: a daily total starting at zero (steps, calories, load, hours of sleep).
 * - dots: sporadic readings (weigh-ins), no line between days that were never measured.
 * - diverge: a value around zero (form), above in one color, below in another.
 * - band: only today's value against its range (HRV balance, ACWR sweet spot).
 * - gauge: a 0–100 score as a ring next to the value (sleep score, Body Battery, stress).
 * Where the tile has a range (see status.ts), it is drawn as a shaded band and today's mark takes
 * the status color.
 */
export type Viz =
  | { kind: "line"; color?: string }
  | { kind: "bars" }
  | { kind: "dots" }
  | { kind: "diverge" }
  | { kind: "band" }
  | { kind: "gauge"; max?: number };

export type Range = { lo: number; hi: number } | null;

const DAYS = 14;
const DAY_MS = 86_400_000;
const H = 24;

const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Points of the last two weeks up to `end`, with their slot 0…13. */
function lastDays(trend: Point[], end: string) {
  const start = Date.parse(shift(end, -(DAYS - 1)));
  return trend
    .map((p) => ({ ...p, i: Math.round((Date.parse(p.date) - start) / DAY_MS) }))
    .filter((p) => p.i >= 0 && p.i < DAYS);
}

/** Ring for a 0–100 score; sits in the value row, not at the foot. */
export function Ring({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(value / max, 1));
  return (
    <svg className="ring" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} className="ring-track" />
      <circle
        cx="18"
        cy="18"
        r={r}
        className="ring-fill"
        style={{ stroke: color ?? "var(--s1)" }}
        strokeDasharray={`${f * c} ${c}`}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

/** Vertical scale over the values and the finite edges of the range. */
function scale(vals: number[], range: Range, fromZero: boolean) {
  const all = [...vals, ...(range ? [range.lo, range.hi].filter(Number.isFinite) : [])];
  let lo = fromZero ? Math.min(0, ...all) : Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) {
    hi += 1;
    if (!fromZero) lo -= 1;
  }
  const pad = fromZero ? 0 : (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  /** y in viewBox units, 1 (top) … H-1 (bottom). */
  return (v: number) => H - 1 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - 2);
}

function BandRect({ range, y }: { range: Range; y: (v: number) => number }) {
  if (!range) return null;
  const top = y(range.hi);
  const bottom = y(range.lo);
  return <rect className="range-band" x="0" width="100" y={top} height={Math.max(bottom - top, 0.5)} />;
}

/** Foot of the tile for every kind except gauge (see Ring). */
export function TileViz({ viz, trend, end, value, range = null, tone }: {
  viz: Viz;
  trend: Point[];
  end: string;
  value: number | null;
  range?: Range;
  /** Status color for today's mark. */
  tone?: string;
}) {
  const pts = lastDays(trend, end);
  const today = pts.find((p) => p.i === DAYS - 1);
  const mark = tone ?? "var(--s1)";

  if (viz.kind === "gauge") return null;

  if (viz.kind === "band") {
    if (value === null || !range) return <div className="spark" />;
    const vs = [...[range.lo, range.hi].filter(Number.isFinite), value];
    const span = Math.max(...vs) - Math.min(...vs) || 1;
    const min = Math.min(...vs) - span * 0.25;
    const max = Math.max(...vs) + span * 0.25;
    const x = (n: number) => ((Math.max(min, Math.min(max, n)) - min) / (max - min)) * 100;
    return (
      <div className="spark viz-band" aria-hidden>
        <span className="band" style={{ left: `${x(range.lo)}%`, width: `${x(range.hi) - x(range.lo)}%` }} />
        <span className="mark" style={{ left: `${x(value)}%`, background: mark }} />
      </div>
    );
  }

  if (pts.length < (viz.kind === "line" ? 2 : 1)) return <div className="spark" />;
  const vals = pts.map((p) => p.value);
  const w = 100 / DAYS;

  if (viz.kind === "dots") {
    const y = scale(vals, range, false);
    const last = pts.at(-1)!;
    return (
      <div className="spark viz-dots" aria-hidden>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
          <BandRect range={range} y={y} />
        </svg>
        {pts.map((p) => (
          <span
            key={p.date}
            className={p === last ? "last" : undefined}
            style={{ left: `${((p.i + 0.5) / DAYS) * 100}%`, top: `${(y(p.value) / H) * 100}%`, background: p === last ? mark : undefined }}
          />
        ))}
      </div>
    );
  }

  if (viz.kind === "bars" || viz.kind === "diverge") {
    const y = scale(vals, range, true);
    const zero = y(0);
    return (
      <svg className="spark viz-bars" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
        <BandRect range={range} y={y} />
        {viz.kind === "diverge" && <line x1="0" x2="100" y1={zero} y2={zero} className="zero" />}
        {pts.map((p) => {
          const top = Math.min(y(p.value), zero);
          const h = Math.max(Math.abs(y(p.value) - zero), 1);
          const fill = p === today ? mark : viz.kind === "diverge" ? (p.value >= 0 ? "var(--s3)" : "var(--s2)") : "var(--axis)";
          return (
            <rect
              key={p.date}
              x={p.i * w + w * 0.15}
              width={w * 0.7}
              y={p.value >= 0 ? zero - h : top}
              height={h}
              style={{ fill, opacity: viz.kind === "diverge" && p !== today ? 0.45 : 1 }}
            />
          );
        })}
      </svg>
    );
  }

  // Line, x by calendar day so missing days stay visible as wider steps.
  const y = scale(vals, range, false);
  const x = (i: number) => (i / (DAYS - 1)) * 100;
  const last = pts.at(-1)!;
  return (
    <div className="spark viz-line" style={viz.color ? { color: viz.color } : undefined} aria-hidden>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
        <BandRect range={range} y={y} />
        <polyline points={pts.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")} />
      </svg>
      {last === today && <span className="end" style={{ left: `${x(last.i)}%`, top: `${(y(last.value) / H) * 100}%`, background: mark }} />}
    </div>
  );
}
