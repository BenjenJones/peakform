import { useCallback } from "react";
import type { PageProps } from "../App";
import { daysAgo, type SeriesMap, useApi } from "../api";
import { base, Chart, line, type Tokens } from "../Chart";
import { dateAxisPointer, useI18n } from "../i18n";
import { CardTitle } from "../ui";

const KEYS = ["weight", "bmi", "body_fat", "body_water", "muscle_mass", "bone_mass"];

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

/** Weight and body composition from the scale. */
export function Health({ range, refreshKey }: PageProps) {
  const { t: tr, lang } = useI18n();
  const { data: s } = useApi<SeriesMap>(`series?keys=${KEYS.join(",")}&from=${daysAgo(range)}`, [range, refreshKey]);
  const has = (k: string) => (s?.[k]?.length ?? 0) > 0;

  /* eslint-disable react-hooks/exhaustive-deps */
  const weight = useCallback((t: Tokens) => timeChart(t, [line(tr("metric.weight"), pts(s, "weight"), t.s1)], false), [s, lang]);
  const bmi = useCallback((t: Tokens) => timeChart(t, [line(tr("metric.bmi"), pts(s, "bmi"), t.s3)], false), [s, lang]);
  const composition = useCallback(
    (t: Tokens) => timeChart(t, [line(tr("metric.body_fat"), pts(s, "body_fat"), t.s2), line(tr("metric.body_water"), pts(s, "body_water"), t.s1)]),
    [s, lang],
  );
  const mass = useCallback(
    (t: Tokens) => timeChart(t, [line(tr("metric.muscle_mass"), pts(s, "muscle_mass"), t.s3), line(tr("metric.bone_mass"), pts(s, "bone_mass"), t.s4)]),
    [s, lang],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  if (s && !has("weight")) return <div className="grid"><div className="card empty">{tr("health.empty")}</div></div>;

  return (
    <div className="grid">
      <div className="card span-6">
        <CardTitle icon="weight" title={tr("health.weight")} sub="kg" help="help.weight" />
        <Chart option={weight} expand={tr("health.weight")} icon="weight" height={220} group="health" />
      </div>
      {has("bmi") && (
        <div className="card span-6">
          <CardTitle icon="bmi" title={tr("health.bmi")} sub="kg/m²" help="help.bmi" />
          <Chart option={bmi} expand={tr("health.bmi")} icon="bmi" height={220} group="health" />
        </div>
      )}
      {(has("body_fat") || has("body_water")) && (
        <div className="card span-6">
          <CardTitle icon="bodyFat" title={tr("health.composition")} sub="%" help="help.body" />
          <Chart option={composition} expand={tr("health.composition")} icon="bodyFat" height={220} group="health" />
        </div>
      )}
      {(has("muscle_mass") || has("bone_mass")) && (
        <div className="card span-6">
          <CardTitle icon="muscle" title={tr("health.mass")} sub="kg" help="help.muscle_mass" />
          <Chart option={mass} expand={tr("health.mass")} icon="muscle" height={220} group="health" />
        </div>
      )}
    </div>
  );
}
