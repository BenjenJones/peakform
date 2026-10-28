import * as echarts from "echarts";
import langDE from "echarts/i18n/langDE-obj.js";
import { useEffect, useRef, useState } from "react";
import { fmtNum, useI18n } from "./i18n";

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

export function Chart({
  option,
  height = 240,
  group,
  onClick,
  onHover,
}: {
  option: (t: Tokens) => object;
  height?: number;
  group?: string;
  onClick?: (p: echarts.ECElementEvent) => void;
  /** x-axis value under the crosshair, null when the pointer leaves. */
  onHover?: (x: number | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
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
    chart.current.setOption(option(t) as echarts.EChartsOption, true);
    if (group) {
      chart.current.group = group;
      echarts.connect(group);
    }
  }, [option, t, group, lang]);

  useEffect(() => {
    if (!chart.current || !onClick) return;
    chart.current.on("click", onClick);
    return () => void chart.current?.off("click", onClick);
  }, [onClick, lang]);

  useEffect(() => {
    const c = chart.current;
    if (!c || !onHover) return;
    const move = (e: unknown) => {
      const v = (e as { axesInfo?: { value: number }[] }).axesInfo?.[0]?.value;
      if (typeof v === "number") onHover(v);
    };
    const out = () => onHover(null);
    c.on("updateAxisPointer", move);
    c.on("globalout", out);
    return () => {
      c.off("updateAxisPointer", move);
      c.off("globalout", out);
    };
  }, [onHover, lang]);

  return <div ref={el} style={{ width: "100%", height }} />;
}
