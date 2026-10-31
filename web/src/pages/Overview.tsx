import { useCallback } from "react";
import type { PageProps } from "../App";
import { type ActivityLite, daysAgo, fmtDuration, type LoadDay, type Point, type Readiness, type SeriesMap, useApi } from "../api";
import { base, Chart, line, type Tokens } from "../Chart";
import { dateAxisPointer, fmtDate, fmtDayShort, fmtNum, type Key, useI18n } from "../i18n";
import { type MetricKey, MetricIcon } from "../icons";
import { CardTitle, Info } from "../ui";
import { tap, useMetricZoom } from "../Zoom";

const TILE_KEYS: { key: string; icon: MetricKey; help: Key; unit: string; digits: number; higherIsBetter: boolean }[] = [
  { key: "hrv_night", icon: "hrv", help: "help.hrv", unit: "ms", digits: 0, higherIsBetter: true },
  { key: "rhr", icon: "rhr", help: "help.rhr", unit: "bpm", digits: 0, higherIsBetter: false },
  { key: "sleep_hours", icon: "sleep", help: "help.sleep", unit: "h", digits: 1, higherIsBetter: true },
  { key: "sleep_score", icon: "sleepScore", help: "help.sleep_score", unit: "", digits: 0, higherIsBetter: true },
  { key: "bb_high", icon: "bodyBattery", help: "help.bb", unit: "", digits: 0, higherIsBetter: true },
  { key: "stress_avg", icon: "stress", help: "help.stress", unit: "", digits: 0, higherIsBetter: false },
];

const latest = (s: Point[] | undefined) => s?.[s.length - 1];
const avg = (s: Point[]) => (s.length ? s.reduce((a, p) => a + p.value, 0) / s.length : NaN);

export function Overview({ range, refreshKey }: PageProps) {
  const { t, lang, metric, sport } = useI18n();
  const from = daysAgo(range);
  const { data: rd } = useApi<Readiness>("readiness", [refreshKey]);
  const { data: series } = useApi<SeriesMap>(`series?keys=${TILE_KEYS.map((k) => k.key).join(",")}&from=${daysAgo(35)}`, [refreshKey]);
  const { data: load } = useApi<LoadDay[]>(`load?from=${from}`, [refreshKey]);
  const { data: acts } = useApi<ActivityLite[]>(`activities?from=${daysAgo(14)}`, [refreshKey]);
  const zoom = useMetricZoom(daysAgo(0));

  const dateAxis = (tk: Tokens) => ({
    ...(base(tk).xAxis as object),
    type: "category" as const,
    data: load?.map((d) => d.date),
    axisLabel: { color: tk.muted, fontSize: 11, formatter: fmtDayShort },
    axisPointer: dateAxisPointer,
  });

  const formOption = useCallback(
    (tk: Tokens) => ({
      ...base(tk),
      xAxis: dateAxis(tk),
      yAxis: { ...(base(tk).yAxis as object), type: "value" as const, scale: false },
      series: [
        line(t("metric.load.ctl"), load?.map((d) => [d.date, d.ctl]) ?? [], tk.s1),
        line(t("metric.load.atl"), load?.map((d) => [d.date, d.atl]) ?? [], tk.s2),
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load, lang],
  );

  const tsbOption = useCallback(
    (tk: Tokens) => ({
      ...base(tk),
      legend: { show: false },
      xAxis: dateAxis(tk),
      yAxis: { ...(base(tk).yAxis as object), type: "value" as const, scale: false },
      series: [
        {
          ...line(t("metric.load.tsb"), load?.map((d) => [d.date, d.tsb]) ?? [], tk.s3),
          areaStyle: { color: tk.s3, opacity: 0.12 },
          markLine: { silent: true, symbol: "none", lineStyle: { color: tk.axis, type: "solid" as const }, data: [{ yAxis: 0 }], label: { show: false } },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load, lang],
  );

  return (
    <div className="grid">
      {zoom.dialog}
      <div className="card span-4">
        <CardTitle icon="readiness" title={t("overview.readiness")} sub={t("overview.readinessSub")} help="help.readiness" />
        {rd?.score == null ? (
          <div className="empty">{t("overview.readinessEmpty")}</div>
        ) : (
          <div className="hero">
            <div className="score">{rd.score}</div>
            <div className="parts">
              {rd.parts.map((p) => (
                <div key={p.key}>
                  <div>{t(`part.${p.key}` as Key)}</div>
                  <strong style={{ color: p.z >= 0 ? "var(--up)" : "var(--critical)" }}>
                    {p.z >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(p.z), 1)}σ
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card span-8" style={{ padding: 0, background: "none", border: 0 }}>
        <div className="tiles three">
          {TILE_KEYS.map((k) => {
            const s = series?.[k.key] ?? [];
            const now = latest(s);
            const base7 = avg(s.slice(-8, -1));
            const delta = now ? now.value - base7 : NaN;
            const good = k.higherIsBetter ? delta >= 0 : delta <= 0;
            const label = k.key === "bb_high" ? t("metric.body_battery") : metric(k.key);
            const open = () => zoom.open({ title: label, icon: k.icon, unit: k.unit, fmt: (v) => fmtNum(v, k.digits), source: k.key, hrGroup: k.key === "rhr" });
            return (
              <div
                className="tile click"
                key={k.key}
                {...tap(open)}
              >
                <div className="label">
                  <MetricIcon m={k.icon} />
                  {label}
                  <Info help={k.help} />
                </div>
                <div className="value">
                  {now ? fmtNum(now.value, k.digits) : "–"}
                  <span className="unit">{k.unit}</span>
                </div>
                <div className="delta">
                  {Number.isFinite(delta) ? (
                    <span style={{ color: good ? "var(--up)" : "var(--ink-2)" }}>
                      {delta >= 0 ? "+" : ""}
                      {fmtNum(delta, k.digits)} {t("common.vs7d")}
                    </span>
                  ) : (
                    t("common.noData")
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card span-8">
        <CardTitle icon="fitness" title={t("overview.fitnessFatigue")} sub={t("overview.fitnessFatigueSub")} help="help.fitness_fatigue" />
        <Chart option={formOption} group="overview" expand={t("overview.fitnessFatigue")} icon="fitness" />
        <div style={{ marginTop: 12 }}>
          <CardTitle icon="form" title={t("overview.form")} sub={t("overview.formSub")} help="help.tsb" />
        </div>
        <Chart option={tsbOption} height={160} group="overview" expand={t("overview.form")} icon="form" />
      </div>

      <div className="card span-4">
        <CardTitle title={t("overview.recent")} sub={t("overview.recentCount", { n: acts?.length ?? 0 })} help="help.load" />
        <table>
          <tbody>
            {acts?.map((a) => (
              <tr key={a.id} className="click" onClick={() => (location.hash = `#/activities/${a.id}`)}>
                <td>
                  <div>{a.name || sport(a.type)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fmtDate(a.date)} · {sport(a.type)}
                  </div>
                </td>
                <td className="num">{fmtDuration(a.durationS)}</td>
                <td className="num muted">{a.load ? Math.round(a.load) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
