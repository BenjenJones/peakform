import { useCallback, useMemo, useState } from "react";
import type { PageProps } from "../App";
import { type ActivityLite, daysAgo, fmtCurveDuration, fmtPace, type LoadDay, useApi } from "../api";
import { base, Chart, line, type Tokens } from "../Chart";
import { dateAxisPointer, fmtDayShort, fmtNum, useI18n } from "../i18n";
import { CardTitle } from "../ui";

type CurveField = "power" | "speed" | "hr";
interface CurvePoint { durationS: number; value: number; activityId: number; date: string }

const weekStart = (d: string) => {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
};

export function Training({ range, refreshKey }: PageProps) {
  const { t: tr, lang, sport } = useI18n();
  const from = daysAgo(range);
  const { data: load } = useApi<LoadDay[]>(`load?from=${from}`, [refreshKey]);
  const { data: acts } = useApi<ActivityLite[]>(`activities?from=${from}`, [refreshKey]);
  const [field, setField] = useState<CurveField>("power");
  const [type, setType] = useState("");
  const { data: curve } = useApi<CurvePoint[]>(`curve?field=${field}&from=${from}${type ? `&type=${type}` : ""}`, [refreshKey]);
  const { data: curveAll } = useApi<CurvePoint[]>(`curve?field=${field}&from=${daysAgo(730)}${type ? `&type=${type}` : ""}`, [refreshKey]);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    acts?.forEach((a) => counts.set(a.type, (counts.get(a.type) ?? 0) + a.durationS));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [acts]);

  const loadOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      return {
        ...b,
        xAxis: { ...(b.xAxis as object), type: "category" as const, data: load?.map((d) => d.date), axisLabel: { color: t.muted, fontSize: 11, formatter: fmtDayShort }, axisPointer: dateAxisPointer },
        yAxis: { ...(b.yAxis as object), type: "value" as const, scale: false },
        series: [
          { type: "bar" as const, name: tr("training.dailyLoad"), data: load?.map((d) => d.load), barMaxWidth: 8, itemStyle: { color: t.s1, borderRadius: [4, 4, 0, 0] } },
          line(tr("metric.load.ctl"), load?.map((d) => [d.date, d.ctl]) ?? [], t.s2),
        ],
      };
    },
    [load, lang],
  );

  const acwrOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      return {
        ...b,
        legend: { show: false },
        xAxis: { ...(b.xAxis as object), type: "category" as const, data: load?.map((d) => d.date), axisLabel: { color: t.muted, fontSize: 11, formatter: fmtDayShort }, axisPointer: dateAxisPointer },
        yAxis: { ...(b.yAxis as object), type: "value" as const, min: 0 },
        series: [
          {
            ...line("ATL : CTL", load?.map((d) => [d.date, d.acwr]) ?? [], t.s1),
            markArea: {
              silent: true,
              itemStyle: { color: t.good, opacity: 0.08 },
              data: [[{ yAxis: 0.8 }, { yAxis: 1.3 }]],
            },
          },
        ],
      };
    },
    [load, lang],
  );

  const weeklyOpt = useCallback(
    (t: Tokens) => {
      // Top 3 sports keep their own color; everything else folds into "Other".
      const top = types.slice(0, 3);
      const colors = [t.s1, t.s2, t.s3, t.muted];
      const keys = [...top, "Other"];
      const weeks = new Map<string, Record<string, number>>();
      for (const a of acts ?? []) {
        const w = weekStart(a.date);
        const k = top.includes(a.type) ? a.type : "Other";
        const row = weeks.get(w) ?? {};
        row[k] = (row[k] ?? 0) + a.durationS / 3600;
        weeks.set(w, row);
      }
      const ws = [...weeks.keys()].sort();
      const b = base(t);
      return {
        ...b,
        tooltip: { ...(b.tooltip as object), valueFormatter: (v: unknown) => `${fmtNum(Number(v), 1)} h` },
        xAxis: { ...(b.xAxis as object), type: "category" as const, data: ws, axisLabel: { color: t.muted, fontSize: 11, formatter: fmtDayShort }, axisPointer: dateAxisPointer },
        yAxis: { ...(b.yAxis as object), type: "value" as const, scale: false },
        series: keys.map((k, i) => ({
          type: "bar" as const,
          name: k === "Other" ? tr("training.other") : sport(k),
          stack: "w",
          barMaxWidth: 22,
          data: ws.map((w) => weeks.get(w)?.[k] ?? 0),
          itemStyle: { color: colors[i], borderColor: t.surface, borderWidth: 2 },
        })),
      };
    },
    [acts, types, lang],
  );

  const curveOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      const fmt = (v: number) => (field === "speed" ? fmtPace(v) : `${fmtNum(v)} ${field === "power" ? "W" : "bpm"}`);
      // Category axis at the fixed curve durations: evenly spaced like a log scale, with clean labels.
      const durations = [...new Set([...(curveAll ?? []), ...(curve ?? [])].map((p) => p.durationS))].sort((a, b) => a - b);
      const toData = (c: CurvePoint[] | null) =>
        durations.map((d) => [fmtCurveDuration(d), c?.find((p) => p.durationS === d)?.value ?? null]);
      return {
        ...b,
        tooltip: { ...(b.tooltip as object), valueFormatter: (v: unknown) => (v == null ? "–" : fmt(Number(v))) },
        xAxis: { ...(b.xAxis as object), type: "category" as const, boundaryGap: false, data: durations.map(fmtCurveDuration) },
        yAxis: { ...(b.yAxis as object), type: "value" as const, axisLabel: { color: t.muted, formatter: (v: number) => (field === "speed" ? fmtPace(v).replace(" /km", "") : String(v)) } },
        series: [
          line(tr("training.lastDays", { n: range }), toData(curve), t.s1, { showSymbol: true, symbolSize: 8 }),
          line(tr("training.best2y"), toData(curveAll), t.s2, { lineStyle: { width: 2, color: t.s2, type: "dashed" } }),
        ],
      };
    },
    [curve, curveAll, field, range, lang],
  );

  return (
    <div className="grid">
      <div className="card">
        <CardTitle icon="load" title={tr("training.load")} sub={tr("training.loadSub")} help="help.load" />
        <Chart option={loadOpt} expand={tr("training.load")} icon="load" height={260} />
      </div>
      <div className="card span-6">
        <CardTitle icon="acwr" title={tr("training.acwr")} sub={tr("training.acwrSub")} help="help.acwr" />
        <Chart option={acwrOpt} expand={tr("training.acwr")} icon="acwr" height={220} />
      </div>
      <div className="card span-6">
        <CardTitle icon="weekly" title={tr("training.weekly")} sub={tr("training.weeklySub")} help="help.weekly" />
        <Chart option={weeklyOpt} expand={tr("training.weekly")} icon="weekly" height={220} />
      </div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <CardTitle icon="curve" title={tr("training.curve")} sub={tr("training.curveSub")} help="help.meanmax" />
          </div>
          <div className="controls">
            <select value={field} onChange={(e) => setField(e.target.value as CurveField)} aria-label={tr("data.metric")}>
              <option value="power">{tr("training.power")}</option>
              <option value="speed">{tr("training.speed")}</option>
              <option value="hr">{tr("training.hr")}</option>
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label={tr("activities.sport")}>
              <option value="">{tr("training.allSports")}</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {sport(t)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {curve?.length ? <Chart option={curveOpt} height={280} expand={tr("training.curve")} icon="curve" /> : <div className="empty">{tr("training.noStreams")}</div>}
      </div>
    </div>
  );
}
