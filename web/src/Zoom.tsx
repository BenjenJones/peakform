import { createContext, type KeyboardEvent, useCallback, useContext, useMemo, useState } from "react";
import { type LoadDay, type Point, type SeriesMap, useApi } from "./api";
import { base, Chart, line, type Tokens, zoomable } from "./Chart";
import { dateAxisPointer, fmtDate, fmtDayShort, useI18n } from "./i18n";
import type { MetricKey } from "./icons";
import { Dialog, leaveTo } from "./ui";

/** Where a metric's history comes from: a daily metric key, a training load field, or derived intensity minutes. */
export type MetricSource = string | { load: "load" | "ctl" | "atl" | "tsb" | "acwr" } | { intensity: true };

export interface MetricSpec {
  title: string;
  icon: MetricKey;
  unit?: string;
  fmt: (v: number) => string;
  source: MetricSource;
  /** Bars instead of a line, for daily totals such as steps. */
  bar?: boolean;
  /** Resting, lowest or highest heart rate: drawn together, the tapped one emphasized. */
  hrGroup?: boolean;
}

const RANGES = [7, 30, 90, 365, 730];
/** Top to bottom as they lie in the chart. */
const HR_KEYS = ["hr_max", "rhr", "hr_min"];

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Local midnight, which dateAxisPointer formats back to the same calendar day. */
const ms = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
function sourcePath(src: MetricSource, from: string, to: string, hrGroup?: boolean) {
  if (hrGroup) return `series?keys=${HR_KEYS.join(",")}&from=${from}&to=${to}`;
  if (typeof src === "string") return `series?keys=${src}&from=${from}&to=${to}`;
  if ("load" in src) return `load?from=${from}&to=${to}`;
  return `series?keys=intensity_moderate,intensity_vigorous&from=${from}&to=${to}`;
}

function toPoints(src: MetricSource, data: unknown): Point[] {
  if (!data) return [];
  if (typeof src === "string") return (data as SeriesMap)[src] ?? [];
  if ("load" in src) {
    return (data as LoadDay[]).flatMap((x) => (x[src.load] === null ? [] : [{ date: x.date, value: x[src.load] as number }]));
  }
  // Garmin counts vigorous minutes double.
  const s = data as SeriesMap;
  const vig = new Map((s.intensity_vigorous ?? []).map((p) => [p.date, p.value]));
  return (s.intensity_moderate ?? []).map((p) => ({ date: p.date, value: p.value + 2 * (vig.get(p.date) ?? 0) }));
}

/** Mean of the 7 calendar days up to and including each point. */
function rolling7(pts: Point[]) {
  return pts.map((p, i) => {
    const from = shift(p.date, -6);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && pts[j].date >= from; j--) {
      sum += pts[j].value;
      n++;
    }
    return [ms(p.date), sum / n];
  });
}

/** A metric's history up to `date`, full-size, with a range picker. Tapping a point opens that day. */
export function MetricDialog({ spec, date, onClose }: { spec: MetricSpec; date: string; onClose: () => void }) {
  const { t, lang, metric } = useI18n();
  // Opens on the closest view; longer ranges are one tap away.
  const [days, setDays] = useState(RANGES[0]);
  const from = shift(date, -(days - 1));
  const { data } = useApi<unknown>(sourcePath(spec.source, from, date, spec.hrGroup), []);
  const pts = toPoints(spec.source, data).filter((p) => p.date >= from && p.date <= date);
  const vs = pts.map((p) => p.value);
  const sel = pts.find((p) => p.date === date);

  const option = useCallback(
    (tk: Tokens) => {
      const b = base(tk);
      const markPoint = sel
        ? { symbol: "circle", symbolSize: 10, itemStyle: { color: tk.s2, borderColor: tk.surface, borderWidth: 2 }, label: { show: false }, data: [{ coord: [ms(sel.date), sel.value] }] }
        : undefined;
      const avg7 = line(t("zoom.avg7"), rolling7(pts), tk.ink2, { lineStyle: { width: 1.5, color: tk.ink2, type: "dashed" } });
      const common = {
        ...b,
        grid: { ...(b.grid as object), left: 56 },
        xAxis: { ...(b.xAxis as object), type: "time" as const, min: ms(from), max: ms(date), axisPointer: dateAxisPointer },
        yAxis: { ...(b.yAxis as object), type: "value" as const, scale: !spec.bar, axisLabel: { color: tk.muted, fontSize: 11, formatter: spec.fmt } },
      };

      if (spec.hrGroup) {
        // Daily span from lowest to highest heart rate as a band, resting heart rate inside it.
        const s = (data ?? {}) as SeriesMap;
        const by = Object.fromEntries(HR_KEYS.map((k) => [k, new Map((s[k] ?? []).map((p) => [ms(p.date), p.value]))]));
        const both = [...by.hr_min.keys()].filter((x) => by.hr_max.has(x)).sort((a, c) => a - c);
        const color: Record<string, string> = { hr_max: tk.s2, rhr: tk.s1, hr_min: tk.s3 };
        const lines = HR_KEYS.map((k) => {
          const on = k === spec.source;
          return line(metric(k), [...by[k]].sort((a, c) => a[0] - c[0]), color[k], {
            lineStyle: { width: on ? 2.5 : 1.25, color: color[k], opacity: on ? 1 : 0.6 },
            showSymbol: on && by[k].size <= 60,
            symbolSize: 6,
            z: on ? 3 : 2,
            markPoint: on ? markPoint : undefined,
          });
        });
        const hidden = { type: "line" as const, stack: "band", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } };
        return {
          ...common,
          legend: { ...(b.legend as object), data: [...HR_KEYS.map((k) => metric(k)), t("zoom.avg7")] },
          tooltip: {
            ...(b.tooltip as object),
            formatter: (ps: { value: [number, number] }[]) => {
              const x = ps[0]?.value[0];
              const rows = HR_KEYS.map((k) => `${metric(k)}: <strong>${by[k].has(x) ? spec.fmt(by[k].get(x)!) : "–"}</strong>`);
              return [fmtDate(iso(x)), ...rows].join("<br>");
            },
          },
          series: [
            // Stacked pair: an invisible base at the minimum, the filled difference up to the maximum on top.
            { ...hidden, data: both.map((x) => [x, by.hr_min.get(x)!]) },
            { ...hidden, data: both.map((x) => [x, by.hr_max.get(x)! - by.hr_min.get(x)!]), areaStyle: { color: tk.s2, opacity: 0.12 } },
            ...lines,
            avg7,
          ],
        };
      }

      const values = pts.map((p) => [ms(p.date), p.value]);
      const main = spec.bar
        ? { type: "bar" as const, name: spec.title, data: values, barMaxWidth: 14, itemStyle: { color: tk.s1 } }
        : line(spec.title, values, tk.s1, { showSymbol: pts.length <= 60, symbolSize: 6 });
      return {
        ...common,
        legend: { ...(b.legend as object), data: [spec.title, t("zoom.avg7")] },
        tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => (typeof v === "number" ? spec.fmt(v) : "–") },
        series: [{ ...main, markPoint }, avg7],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, days, date, lang],
  );

  const pick = useCallback(
    (p: { value?: unknown }) => {
      const x = Array.isArray(p.value) ? p.value[0] : null;
      if (typeof x !== "number") return;
      onClose();
      leaveTo(`#/day/${iso(x)}`);
    },
    [onClose],
  );

  const sum = (label: string, v: number | undefined) => (
    <span>
      {label} <strong>{v === undefined || !Number.isFinite(v) ? "–" : spec.fmt(v)}</strong>
    </span>
  );

  return (
    <Dialog
      title={spec.title}
      icon={spec.icon}
      onClose={onClose}
      tools={
        <div className="seg" role="group">
          {RANGES.map((n) => (
            <button key={n} type="button" className="btn" aria-pressed={n === days} onClick={() => setDays(n)}>
              {n < 365 ? t("zoom.days", { n }) : t("zoom.years", { n: n / 365 })}
            </button>
          ))}
        </div>
      }
    >
      <div className="dialog-sum">
        {sum(fmtDayShort(date), sel?.value)}
        {sum(t("zoom.avg"), vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : undefined)}
        {sum(t("zoom.min"), vs.length ? Math.min(...vs) : undefined)}
        {sum(t("zoom.max"), vs.length ? Math.max(...vs) : undefined)}
        {spec.unit && <span className="muted">{spec.unit}</span>}
        <span className="muted hint">{t("zoom.pickHint")}</span>
      </div>
      <div className="dialog-chart">
        {data ? <PlainZoom option={option} onClick={pick} /> : <div className="empty">{t("common.loading")}</div>}
      </div>
    </Dialog>
  );
}

function PlainZoom({ option, onClick }: { option: (t: Tokens) => object; onClick: (p: { value?: unknown }) => void }) {
  const big = useMemo(() => zoomable(option), [option]);
  return <Chart option={big} onClick={onClick} height="100%" />;
}

/** Props that make a tile open its metric's big chart on tap. */
export function tap(open: (() => void) | null) {
  if (!open) return {};
  return {
    role: "button",
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      open();
    },
  };
}

/** Opens a metric's big chart; provided by pages whose tiles can be tapped. */
export const ZoomCtx = createContext<((spec: MetricSpec) => void) | null>(null);
export const useZoom = () => useContext(ZoomCtx);

/** Provides ZoomCtx and renders the dialog for the metric last tapped. */
export function useMetricZoom(date: string) {
  const [spec, setSpec] = useState<MetricSpec | null>(null);
  const close = useCallback(() => setSpec(null), []);
  const dialog = spec && <MetricDialog spec={spec} date={date} onClose={close} />;
  return { open: setSpec, dialog };
}
