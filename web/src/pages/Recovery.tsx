import { useCallback } from "react";
import type { PageProps } from "../App";
import { daysAgo, type SeriesMap, useApi } from "../api";
import { base, Chart, line, type Tokens } from "../Chart";
import { dateAxisPointer, useI18n } from "../i18n";
import { CardTitle } from "../ui";

const KEYS = [
  "hrv_night", "hrv_base_low", "hrv_base_high", "rhr", "sleep_hours", "deep_sleep_hours",
  "rem_sleep_hours", "light_sleep_hours", "awake_hours", "sleep_score", "stress_avg", "bb_high", "bb_low", "weight",
];

const pts = (s: SeriesMap | null, k: string) => (s?.[k] ?? []).map((p) => [p.date, p.value] as [string, number]);

function timeChart(t: Tokens, series: object[], legend = true) {
  const b = base(t);
  return {
    ...b,
    legend: legend ? b.legend : { show: false },
    xAxis: { ...(b.xAxis as object), type: "time" as const, axisPointer: dateAxisPointer },
    yAxis: { ...(b.yAxis as object), type: "value" as const },
    series,
  };
}

export function Recovery({ range, refreshKey }: PageProps) {
  const { t: tr, lang } = useI18n();
  const { data: s } = useApi<SeriesMap>(`series?keys=${KEYS.join(",")}&from=${daysAgo(range)}`, [range, refreshKey]);

  const hrv = useCallback(
    (t: Tokens) => {
      // Baseline band: stacked areas (low, then high-low) so only the band is filled.
      const low = new Map(pts(s, "hrv_base_low"));
      const band = pts(s, "hrv_base_high")
        .filter(([d]) => low.has(d))
        .map(([d, hi]) => [d, hi - low.get(d)!] as [string, number]);
      return timeChart(t, [
        { type: "line", name: "Baseline low", data: pts(s, "hrv_base_low"), stack: "band", lineStyle: { opacity: 0 }, showSymbol: false, tooltip: { show: false } },
        { type: "line", name: "Balanced range", data: band, stack: "band", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: t.s1, opacity: 0.12 }, tooltip: { show: false } },
        line(tr("recovery.hrv"), pts(s, "hrv_night"), t.s1),
      ], false);
    },
    [s, lang],
  );

  const sleep = useCallback(
    (t: Tokens) => {
      const deep = new Map(pts(s, "deep_sleep_hours"));
      const rem = new Map(pts(s, "rem_sleep_hours"));
      // Garmin reports light sleep directly; fall back to total minus deep and REM if it is missing.
      const light = pts(s, "light_sleep_hours").length
        ? pts(s, "light_sleep_hours")
        : pts(s, "sleep_hours").map(([d, v]) => [d, Math.max(0, v - (deep.get(d) ?? 0) - (rem.get(d) ?? 0))] as [string, number]);
      const bar = (name: string, data: [string, number][], color: string) => ({
        type: "bar" as const, name, data, stack: "sleep", barMaxWidth: 14,
        itemStyle: { color, borderColor: t.surface, borderWidth: 1 },
      });
      // Same bottom-to-top order as Garmin Connect.
      const opt = timeChart(t, [
        bar(tr("recovery.deep"), pts(s, "deep_sleep_hours"), t.s1),
        bar(tr("recovery.light"), light, t.s3),
        bar(tr("recovery.rem"), pts(s, "rem_sleep_hours"), t.s2),
        bar(tr("recovery.awake"), pts(s, "awake_hours"), t.s4),
      ]);
      // Hours as h:mm, so a few awake minutes read as "0:07" rather than "0.1".
      const hm = (v: unknown) => {
        const min = Math.round(Number(v) * 60);
        return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h`;
      };
      return {
        ...opt,
        tooltip: { ...(opt.tooltip as object), valueFormatter: hm },
        yAxis: { ...opt.yAxis, scale: false, name: "h", nameTextStyle: { color: t.muted } },
      };
    },
    [s, lang],
  );

  const simple = (key: string, name: string, colorKey: keyof Tokens) =>
    (t: Tokens) => timeChart(t, [line(name, pts(s, key), t[colorKey])], false);

  /* eslint-disable react-hooks/exhaustive-deps */
  const rhr = useCallback(simple("rhr", tr("metric.rhr"), "s2"), [s, lang]);
  const score = useCallback(simple("sleep_score", tr("metric.sleep_score"), "s1"), [s, lang]);
  const stress = useCallback(simple("stress_avg", tr("metric.stress_avg"), "s2"), [s, lang]);
  const weight = useCallback(simple("weight", tr("metric.weight"), "s1"), [s, lang]);
  const bb = useCallback(
    (t: Tokens) => timeChart(t, [line(tr("recovery.high"), pts(s, "bb_high"), t.s1), line(tr("recovery.low"), pts(s, "bb_low"), t.s2)]),
    [s, lang],
  );

  return (
    <div className="grid">
      <div className="card">
        <CardTitle icon="hrv" title={tr("recovery.hrv")} sub={tr("recovery.hrvSub")} help="help.hrv_chart" />
        <Chart option={hrv} expand={tr("recovery.hrv")} icon="hrv" group="recovery" />
      </div>
      <div className="card span-6">
        <CardTitle icon="rhr" title={tr("recovery.rhr")} sub="bpm" help="help.rhr" />
        <Chart option={rhr} expand={tr("recovery.rhr")} icon="rhr" height={200} group="recovery" />
      </div>
      <div className="card span-6">
        <CardTitle icon="bodyBattery" title={tr("recovery.bb")} sub={tr("recovery.bbSub")} help="help.bb_range" />
        <Chart option={bb} expand={tr("recovery.bb")} icon="bodyBattery" height={200} group="recovery" />
      </div>
      <div className="card span-6">
        <CardTitle icon="stages" title={tr("recovery.stages")} sub={tr("recovery.stagesSub")} help="help.sleep_stages" />
        <Chart option={sleep} expand={tr("recovery.stages")} icon="stages" height={220} group="recovery" />
      </div>
      <div className="card span-6">
        <CardTitle icon="sleepScore" title={tr("recovery.score")} sub="0–100" help="help.sleep_score" />
        <Chart option={score} expand={tr("recovery.score")} icon="sleepScore" height={220} group="recovery" />
      </div>
      <div className="card span-6">
        <CardTitle icon="stress" title={tr("recovery.stress")} sub={tr("recovery.stressSub")} help="help.stress" />
        <Chart option={stress} expand={tr("recovery.stress")} icon="stress" height={200} group="recovery" />
      </div>
      <div className="card span-6">
        <CardTitle icon="weight" title={tr("recovery.weight")} sub="kg" help="help.weight" />
        <Chart option={weight} expand={tr("recovery.weight")} icon="weight" height={200} group="recovery" />
      </div>
    </div>
  );
}
