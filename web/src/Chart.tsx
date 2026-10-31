import * as echarts from "echarts";
import langDE from "echarts/i18n/langDE-obj.js";
import { IconArrowsMaximize } from "@tabler/icons-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, useI18n } from "./i18n";
import type { MetricKey } from "./icons";
import { Dialog } from "./ui";

echarts.registerLocale("DE", langDE as Parameters<typeof echarts.registerLocale>[1]);

export interface Tokens {
  ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string;
  s1: string; s2: string; s3: string; s4: string;
  good: string; warning: string; serious: string; critical: string;
  divNeg: string; divMid: string; divPos: string;
}

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(`--${n}`).trim();
  return {
    ink: v("ink"), ink2: v("ink-2"), muted: v("muted"), grid: v("grid"), axis: v("axis"), surface: v("surface"),
    s1: v("s1"), s2: v("s2"), s3: v("s3"), s4: v("s4"),
    good: v("good"), warning: v("warning"), serious: v("serious"), critical: v("critical"),
    divNeg: v("div-neg"), divMid: v("div-mid"), divPos: v("div-pos"),
  };
}

function useTokens() {
  const [t, setT] = useState(readTokens);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setT(readTokens());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return t;
}

/** Shared chrome: recessive axes, hairline grid, crosshair tooltip. */
export function base(t: Tokens): echarts.EChartsOption {
  const axisCommon = {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
  };
  return {
    animation: false,
    textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: t.ink2 },
    grid: { left: 44, right: 16, top: 28, bottom: 28, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: t.axis } },
      backgroundColor: t.surface,
      borderColor: t.grid,
      textStyle: { color: t.ink, fontSize: 12 },
      valueFormatter: (v) => (typeof v === "number" ? fmtNum(v, Math.abs(v) >= 100 ? 0 : 1) : String(v ?? "–")),
    },
    legend: { top: 0, right: 0, textStyle: { color: t.ink2, fontSize: 12 }, icon: "roundRect", itemWidth: 10, itemHeight: 4 },
    xAxis: { ...axisCommon, splitLine: { show: false } } as echarts.XAXisComponentOption,
    yAxis: { ...axisCommon, scale: true } as echarts.YAXisComponentOption,
  };
}

export const line = (name: string, data: (string | number | null)[][], color: string, extra: object = {}) => ({
  type: "line" as const,
  name,
  data,
  showSymbol: false,
  symbolSize: 8,
  lineStyle: { width: 2, color },
  itemStyle: { color },
  connectNulls: false,
  ...extra,
});

/** Dashed horizontal line at an upper limit, e.g. the heart rate limit for a sport. */
export const limitLine = (value: number, color: string, label: string) => ({
  silent: true,
  symbol: "none",
  label: { formatter: label, position: "insideEndTop", color, fontSize: 11 },
  lineStyle: { color, type: "dashed" },
  data: [{ yAxis: value }],
});

/** y-axis max that keeps a limit line in view even when the data stays below it. */
export const maxWithLimit = (limit: number | null) => (limit ? (v: { max: number }) => Math.max(v.max, limit + 3) : undefined);

/** Dot on a line series at an x value, e.g. a replay position; colored with a theme token. */
export interface Mark {
  x: number;
  /** Index of the series the dot sits on. */
  series: number;
  color: keyof Tokens;
}

type XY = (number | string | null)[];

/** y of an [x, y] series at `x`, interpolated between neighbours; null in gaps or outside the data. */
function yAt(data: XY[], x: number): number | null {
  let lo = 0;
  let hi = data.length - 1;
  if (hi < 0 || x < (data[0][0] as number) || x > (data[hi][0] as number)) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((data[mid][0] as number) <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = data[lo] as [number, number | null];
  const [x1, y1] = data[hi] as [number, number | null];
  if (y0 === null || y1 === null) return y0 ?? y1;
  return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y0;
}

/** Option for the enlarged chart: pinch/wheel zoom plus a slider below, room for it in the grid. */
export function zoomable(option: (t: Tokens) => object) {
  return (t: Tokens) => {
    const o = option(t) as echarts.EChartsOption & { grid?: { bottom?: number } };
    return {
      ...o,
      grid: { ...o.grid, bottom: (o.grid?.bottom ?? 28) + 40 },
      dataZoom: [
        { type: "inside" },
        { type: "slider", height: 22, bottom: 8, borderColor: t.grid, fillerColor: "transparent", textStyle: { color: t.muted, fontSize: 11 } },
      ],
    };
  };
}

/** Chart that opens full-size in a dialog from a small button in its corner. */
export function Chart(props: Parameters<typeof PlainChart>[0] & { expand?: ReactNode; icon?: MetricKey }) {
  const { expand, icon, ...rest } = props;
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const big = useMemo(() => zoomable(rest.option), [rest.option]);
  // The legend moves left to make room for the button in the top right corner.
  const small = useMemo(
    () => (tk: Tokens) => {
      const o = rest.option(tk) as { legend?: { right?: number } };
      return o.legend ? { ...o, legend: { ...o.legend, right: (o.legend.right ?? 0) + 34 } } : o;
    },
    [rest.option],
  );
  if (!expand) return <PlainChart {...rest} />;
  return (
    <div className="chart-box">
      <PlainChart {...rest} option={small} />
      <button type="button" className="expand" onClick={() => setOpen(true)} aria-label={t("zoom.expand")} title={t("zoom.expand")}>
        <IconArrowsMaximize size={15} stroke={1.75} aria-hidden="true" />
      </button>
      {open && (
        <Dialog title={expand} icon={icon} onClose={() => setOpen(false)}>
          <div className="dialog-chart">
            <PlainChart option={big} onClick={rest.onClick} height="100%" />
          </div>
        </Dialog>
      )}
    </div>
  );
}

function PlainChart({
  option,
  height = 240,
  group,
  onClick,
  onHover,
  marks,
}: {
  option: (t: Tokens) => object;
  height?: number | string;
  group?: string;
  onClick?: (p: echarts.ECElementEvent) => void;
  /** x-axis value under the crosshair, null when the pointer leaves. */
  onHover?: (x: number | null) => void;
  /** Cheap to update every frame: only moves graphic elements, the option is not rebuilt. */
  marks?: Mark[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const seriesData = useRef<XY[][]>([]);
  const markCount = useRef(0);
  const t = useTokens();
  const { lang } = useI18n();

  // Re-created on language change: ECharts takes its locale (month names etc.) at init.
  useEffect(() => {
    chart.current = echarts.init(el.current!, null, { locale: lang === "de" ? "DE" : "EN" });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
  }, [lang]);

  useEffect(() => {
    if (!chart.current) return;
    const opt = option(t) as echarts.EChartsOption;
    seriesData.current = ((opt.series ?? []) as { data?: XY[] }[]).map((s) => s.data ?? []);
    // notMerge drops the graphic elements; the marks effect below redraws them.
    markCount.current = 0;
    chart.current.setOption(opt, true);
    if (group) {
      chart.current.group = group;
      echarts.connect(group);
    }
  }, [option, t, group, lang]);

  // Declared after the option effect, so it runs after a rebuild and puts the marks back.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const list = marks ?? [];
    const graphic: object[] = list.map((m, i) => {
      const y = yAt(seriesData.current[m.series] ?? [], m.x);
      if (y === null) return { id: `mark-${i}`, type: "circle", invisible: true };
      const [cx, cy] = c.convertToPixel({ seriesIndex: m.series }, [m.x, y]) as number[];
      return {
        id: `mark-${i}`,
        type: "circle",
        silent: true,
        invisible: false,
        z: 50,
        shape: { cx, cy, r: 5 },
        style: { fill: t[m.color], stroke: t.surface, lineWidth: 2 },
      };
    });
    for (let i = list.length; i < markCount.current; i++) graphic.push({ id: `mark-${i}`, $action: "remove" });
    markCount.current = list.length;
    if (graphic.length) c.setOption({ graphic });
  }, [marks, option, t, lang]);

  useEffect(() => {
    if (!chart.current || !onClick) return;
    chart.current.on("click", onClick);
    return () => void chart.current?.off("click", onClick);
  }, [onClick, lang]);

  useEffect(() => {
    const c = chart.current;
    const node = el.current;
    if (!c || !node || !onHover) return;
    // Connected charts (same group) all fire updateAxisPointer, each snapped to its own data, e.g.
    // the decoupling series starts at 5 min. Only the chart under the pointer reports its value.
    let inside = false;
    const enter = () => (inside = true);
    const leave = () => (inside = false);
    const move = (e: unknown) => {
      const v = (e as { axesInfo?: { value: number }[] }).axesInfo?.[0]?.value;
      if (inside && typeof v === "number") onHover(v);
    };
    const out = () => onHover(null);
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    c.on("updateAxisPointer", move);
    c.on("globalout", out);
    return () => {
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      c.off("updateAxisPointer", move);
      c.off("globalout", out);
    };
  }, [onHover, lang]);

  return <div ref={el} style={{ width: "100%", height }} />;
}
