import { useCallback, useMemo, useState } from "react";
import type { PageProps } from "../App";
import { daysAgo, useApi } from "../api";
import { base, Chart, type Tokens } from "../Chart";
import { fmtDate, fmtNum, useI18n } from "../i18n";
import { CardTitle } from "../ui";

interface Cell { x: string; y: string; r: number | null; n: number }
interface Scatter { points: { date: string; x: number; y: number }[]; r: number | null; n: number }
interface MetricsInfo { insight: string[] }

// Pairs from the same source are trivially correlated; hide them from findings.
const FAMILY: Record<string, string> = {
  hrv_night: "hrv", hrv_weekly: "hrv", sleep_hours: "sleep", deep_sleep_hours: "sleep", rem_sleep_hours: "sleep", light_sleep_hours: "sleep", awake_hours: "sleep", sleep_score: "sleep",
  bb_high: "bb", bb_low: "bb", "load.load": "load", "load.tsb": "load", "load.atl": "load",
};
const MIN_N = 20;

function linearFit(pts: { x: number; y: number }[]) {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return { slope, intercept: my - slope * mx };
}

export function Insights({ range, refreshKey }: PageProps) {
  const { t: tr, lang, metric: name } = useI18n();
  const days = Math.max(range, 90);
  const from = daysAgo(days);
  const [lag, setLag] = useState(1);
  const { data: info } = useApi<MetricsInfo>("metrics", [refreshKey]);
  const { data: cells } = useApi<Cell[]>(`correlations?from=${from}&lag=${lag}`, [refreshKey]);
  const [pick, setPick] = useState<{ x: string; y: string } | null>(null);
  const { data: scatter } = useApi<Scatter>(pick ? `scatter?x=${pick.x}&y=${pick.y}&lag=${lag}&from=${from}` : null, [refreshKey]);

  const today = lag ? ` (${tr("common.today")})` : "";
  const nextDay = lag ? ` (${tr("common.nextDay")})` : "";

  // Only metrics that actually have data.
  const metrics = useMemo(() => {
    if (!cells) return [];
    const has = new Set(cells.filter((c) => c.n >= MIN_N).flatMap((c) => [c.x, c.y]));
    return (info?.insight ?? []).filter((k) => has.has(k));
  }, [cells, info]);

  const findings = useMemo(() => {
    const seen = new Set<string>();
    return (cells ?? [])
      .filter((c) => c.r !== null && c.n >= MIN_N && c.x !== c.y && (!FAMILY[c.x] || FAMILY[c.x] !== FAMILY[c.y]))
      .filter((c) => {
        if (lag) return true;
        const k = [c.x, c.y].sort().join("|");
        return seen.has(k) ? false : (seen.add(k), true);
      })
      .sort((a, b) => Math.abs(b.r!) - Math.abs(a.r!))
      .slice(0, 8);
  }, [cells, lag]);

  const heatOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      const idx = new Map(metrics.map((m, i) => [m, i]));
      const data = (cells ?? [])
        .filter((c) => idx.has(c.x) && idx.has(c.y) && c.r !== null && c.n >= MIN_N)
        .map((c) => [idx.get(c.x), idx.get(c.y), +c.r!.toFixed(2), c.n]);
      return {
        ...b,
        grid: { left: 130, right: 16, top: 8, bottom: 110 },
        tooltip: {
          ...(b.tooltip as object),
          trigger: "item" as const,
          formatter: (p: { value: number[] }) =>
            `${name(metrics[p.value[0]])}${today}<br/>${name(metrics[p.value[1]])}${nextDay}<br/><b>r = ${fmtNum(p.value[2], 2)}</b> · n = ${p.value[3]}`,
        },
        xAxis: { type: "category" as const, data: metrics.map(name), axisLabel: { color: t.muted, rotate: 45, fontSize: 11 }, axisTick: { show: false }, axisLine: { show: false } },
        yAxis: { type: "category" as const, data: metrics.map(name), axisLabel: { color: t.muted, fontSize: 11 }, axisTick: { show: false }, axisLine: { show: false } },
        visualMap: {
          dimension: 2, min: -1, max: 1, calculable: false, orient: "horizontal" as const, left: "center", bottom: 0,
          itemWidth: 10, itemHeight: 160, textStyle: { color: t.muted, fontSize: 11 },
          inRange: { color: [t.divNeg, t.divMid, t.divPos] },
        },
        series: [{ type: "heatmap" as const, data, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 2 } }],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, metrics, lag, lang],
  );

  const scatterOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      const pts = scatter?.points ?? [];
      const fit = pts.length > 2 ? linearFit(pts) : null;
      const xs = pts.map((p) => p.x);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      return {
        ...b,
        // Two series (days, trend line): legend with both, per the >= 2 series rule.
        legend: {
          ...(b.legend as object),
          itemWidth: 14,
          itemHeight: 8,
          data: [
            { name: tr("insights.days"), icon: "circle" },
            // Thin bar keeps its aspect inside the 14x8 box, so it reads as a line.
            { name: tr("insights.trend"), icon: "path://M0,0 L14,0 L14,2 L0,2 Z" },
          ],
        },
        tooltip: {
          ...(b.tooltip as object),
          trigger: "item" as const,
          formatter: (p: { data: number[]; dataIndex: number }) =>
            `${pts[p.dataIndex] ? fmtDate(pts[p.dataIndex].date) : ""}<br/>${fmtNum(p.data[0], 1)} → ${fmtNum(p.data[1], 1)}`,
        },
        // Room below the tick labels for the x-axis title.
        grid: { ...(b.grid as object), top: 36, bottom: 56 },
        xAxis: { ...(b.xAxis as object), type: "value" as const, scale: true, name: name(pick!.x) + today, nameLocation: "middle" as const, nameGap: 32, nameTextStyle: { color: t.ink2 } },
        yAxis: { ...(b.yAxis as object), type: "value" as const, name: name(pick!.y) + nextDay, nameTextStyle: { color: t.ink2, align: "left" as const } },
        series: [
          { type: "scatter" as const, name: tr("insights.days"), data: pts.map((p) => [p.x, p.y]), symbolSize: 8, itemStyle: { color: t.s1, opacity: 0.7, borderColor: t.surface, borderWidth: 1 } },
          ...(fit
            ? [{ type: "line" as const, name: tr("insights.trend"), itemStyle: { color: t.s2 }, data: [[x0, fit.intercept + fit.slope * x0], [x1, fit.intercept + fit.slope * x1]], showSymbol: false, lineStyle: { color: t.s2, width: 2 }, tooltip: { show: false } }]
            : []),
        ],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scatter, pick, lag, lang],
  );

  const onCell = useCallback(
    (p: { value?: unknown }) => {
      const v = p.value as number[] | undefined;
      if (v) setPick({ x: metrics[v[0]], y: metrics[v[1]] });
    },
    [metrics],
  );

  return (
    <div className="grid">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <CardTitle title={tr("insights.title")} sub={tr("insights.sub", { days })} help="help.correlations" />
          </div>
          <select value={lag} onChange={(e) => setLag(Number(e.target.value))} aria-label={tr("insights.lagNext")}>
            <option value={1}>{tr("insights.lagNext")}</option>
            <option value={0}>{tr("insights.lagSame")}</option>
          </select>
        </div>
      </div>

      <div className="card span-4">
        <CardTitle title={tr("insights.top")} sub={tr("insights.topSub", { n: MIN_N })} help="help.findings" />
        {findings.length ? (
          <ol className="findings">
            {findings.map((f) => (
              <li key={f.x + f.y} onClick={() => setPick({ x: f.x, y: f.y })}>
                {tr("insights.finding", {
                  x: name(f.x),
                  dir: f.r! > 0 ? tr("insights.higher") : tr("insights.lower"),
                  y: name(f.y),
                })}
                {lag ? ` (${tr("common.nextDay")})` : ""}{" "}
                <span className="muted">
                  (r {fmtNum(f.r!, 2)}, n {f.n})
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty">{tr("insights.notEnough")}</div>
        )}
      </div>

      <div className="card span-8">
        {metrics.length ? (
          <Chart option={heatOpt} height={Math.max(360, metrics.length * 26 + 140)} onClick={onCell} />
        ) : (
          <div className="empty">{tr("insights.waiting")}</div>
        )}
      </div>

      {pick && scatter && (
        <div className="card">
          <h2>
            {name(pick.x)} {tr("insights.vs")} {name(pick.y)}
            {nextDay}
          </h2>
          <p className="sub">{tr("insights.scatterSub", { r: scatter.r == null ? "–" : fmtNum(scatter.r, 2), n: scatter.n })}</p>
          <Chart option={scatterOpt} height={320} expand={`${name(pick.x)} ${tr("insights.vs")} ${name(pick.y)}`} />
        </div>
      )}
    </div>
  );
}
