import { createContext, type ReactNode, useCallback, useContext } from "react";
import type { PageProps } from "../App";
import { type DayData, type DayHr, type DayMetric, fmtDuration, type Night, type Point, useApi } from "../api";
import { base, Chart, line, type Tokens } from "../Chart";
import { dateAxisPointer, fmtDate, fmtDayShort, fmtNum, type Key, type T, useI18n } from "../i18n";
import { type MetricKey, MetricIcon } from "../icons";
import { CardTitle, Info } from "../ui";
import { type MetricSource, tap, useMetricZoom, useZoom, ZoomCtx } from "../Zoom";

const pad = (n: number) => String(n).padStart(2, "0");
// The user's calendar day, not UTC: late evening must not already show tomorrow.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const go = (day: string) => (location.hash = `#/day/${day}`);
/** Hours as h:mm, so 7.83 reads as "7:50". */
const fmtHm = (h: number) => {
  const min = Math.round(Math.abs(h) * 60);
  return `${Math.floor(min / 60)}:${pad(min % 60)}`;
};
const hm = (h: number) => `${fmtHm(h)} h`;

const EMPTY: DayMetric = { value: null, avg7: null, baseline: null, trend: [] };

/** Day shown on the page; sparklines place their points relative to it. */
const DayCtx = createContext("");

type Tone = "good" | "bad" | "neutral";

/** Rule-based notes for the summary card, worth-attention first. */
function findings(d: DayData, t: T): { tone: Tone; text: string }[] {
  const m = (k: string) => d.metrics[k] ?? EMPTY;
  const v = (k: string) => m(k).value;
  const out: { tone: Tone; text: string }[] = [];
  const add = (tone: Tone, key: Key, vars?: Record<string, string | number>) => out.push({ tone, text: t(key, vars) });

  const hrv = v("hrv_night");
  const lo = v("hrv_base_low");
  const hi = v("hrv_base_high");
  if (hrv !== null && lo !== null && hi !== null) {
    const vars = { v: fmtNum(hrv), lo: fmtNum(lo), hi: fmtNum(hi) };
    if (hrv < lo) add("bad", "f.hrv.low", vars);
    else if (hrv > hi) add("neutral", "f.hrv.high", vars);
    else add("good", "f.hrv.in", vars);
  }

  const sleep = v("sleep_hours");
  const need = v("sleep_need_hours");
  if (sleep !== null && need !== null) {
    const diff = sleep - need;
    const vars = { v: hm(sleep), need: hm(need), diff: hm(diff) };
    if (diff >= -0.25) add("good", "f.sleep.ok", vars);
    else if (diff >= -1) add("neutral", "f.sleep.bit", vars);
    else add("bad", "f.sleep.short", vars);
  } else if (sleep !== null) add("neutral", "f.sleep.plain", { v: hm(sleep) });
  const score = v("sleep_score");
  if (score !== null && score < 60) add("bad", "f.sleepScore.low", { v: fmtNum(score) });

  const rhr = m("rhr");
  if (rhr.value !== null && rhr.baseline) {
    const diff = rhr.value - rhr.baseline.mean;
    if (diff >= Math.max(3, rhr.baseline.sd)) add("bad", "f.rhr.high", { v: fmtNum(rhr.value), d: `${fmtNum(diff)} bpm` });
    else add("good", "f.rhr.ok", { v: fmtNum(rhr.value) });
  }

  const bb = v("bb_high");
  if (bb !== null) {
    if (bb >= 75) add("good", "f.bb.high", { v: fmtNum(bb) });
    else if (bb < 50) add("bad", "f.bb.low", { v: fmtNum(bb) });
    else add("neutral", "f.bb.mid", { v: fmtNum(bb) });
  }

  const stress = m("stress_avg");
  if (stress.value !== null && stress.baseline && stress.value > stress.baseline.mean + Math.max(5, stress.baseline.sd)) {
    add("bad", "f.stress.high", { v: fmtNum(stress.value), avg: fmtNum(stress.baseline.mean) });
  }

  // Form is meaningless without some training history behind it.
  const ld = d.load.find((x) => x.date === d.date);
  if (ld && ld.ctl > 1) {
    const vars = { v: fmtNum(ld.tsb) };
    if (ld.tsb > 5) add("good", "f.tsb.fresh", vars);
    else if (ld.tsb < -20) add("bad", "f.tsb.heavy", vars);
    else add("neutral", "f.tsb.mid", vars);
    if (ld.acwr !== null && ld.acwr > 1.5) add("bad", "f.acwr.high", { v: fmtNum(ld.acwr, 2) });
  }

  const steps = v("steps");
  const goal = v("steps_goal");
  if (steps !== null && goal) {
    if (steps >= goal) add("good", "f.steps.goal", { v: fmtNum(steps) });
    else add("neutral", "f.steps.short", { v: fmtNum(steps), goal: fmtNum(goal) });
  }
  const imGoal = v("intensity_goal");
  if (imGoal && d.intensityWeek >= imGoal) add("good", "f.intensity.goal", { v: fmtNum(d.intensityWeek), goal: fmtNum(imGoal) });

  const load = fmtNum(d.activities.reduce((a, x) => a + x.load, 0));
  if (!d.activities.length) add("neutral", "f.rest");
  else if (d.activities.length === 1) add("neutral", "f.acts.one", { load });
  else add("neutral", "f.acts", { n: d.activities.length, load });

  return [...out.filter((f) => f.tone === "bad"), ...out.filter((f) => f.tone !== "bad")];
}

function Spark({ trend }: { trend: Point[] }) {
  const end = useContext(DayCtx);
  if (trend.length < 2) return <div className="spark" />;
  // x by calendar day, so missing days stay visible as wider steps.
  const start = Date.parse(shift(end, -13));
  const vs = trend.map((p) => p.value);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const pts = trend
    .map((p) => `${((Date.parse(p.date) - start) / (13 * 86_400_000)) * 100},${hi === lo ? 12 : 22 - ((p.value - lo) / (hi - lo)) * 20}`)
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} />
    </svg>
  );
}

/** Value tile: change vs the 7 days before, colored when the direction has a clear "better". */
function Stat({ icon, label, m, src, bar, intraday, unit = "", digits = 0, fmt, better, help, note }: {
  icon: MetricKey;
  label: string;
  m: DayMetric;
  /** History for the big chart; without it the tile is not tappable. */
  src?: MetricSource;
  bar?: boolean;
  /** Heart rate metric, see MetricSpec. */
  intraday?: boolean;
  unit?: string;
  digits?: number;
  fmt?: (v: number) => string;
  better?: "up" | "down";
  help?: Key;
  note?: ReactNode;
}) {
  const { t } = useI18n();
  const zoom = useZoom();
  // Hide metrics this user's device never records (e.g. SpO2).
  if (m.value === null && !m.trend.length) return null;
  const f = fmt ?? ((v: number) => fmtNum(v, digits));
  const open = zoom && src !== undefined ? () => zoom({ title: label, icon, unit, fmt: f, source: src, bar, intraday }) : null;
  const delta = m.value !== null && m.avg7 !== null ? m.value - m.avg7 : null;
  const good = delta !== null && (better === "up" ? delta >= 0 : better === "down" ? delta <= 0 : false);
  return (
    <div className={open ? "stat click" : "stat"} {...tap(open)}>
      <div className="label">
        <MetricIcon m={icon} />
        {label}
        {help && <Info help={help} />}
      </div>
      <div className="value">
        {m.value !== null ? f(m.value) : "–"}
        {unit && m.value !== null && <span className="unit">{unit}</span>}
      </div>
      <div className="delta">
        {note ??
          (delta !== null ? (
            <span style={{ color: good ? "var(--up)" : "var(--ink-2)" }}>
              {delta >= 0 ? "+" : "−"}
              {f(Math.abs(delta))} {t("day.vs7d")}
            </span>
          ) : (
            t("common.noData")
          ))}
      </div>
      <Spark trend={m.trend} />
    </div>
  );
}

function Stack({ parts, fmt, icon, unit }: {
  parts: { label: string; value: number | null; color: string; src: string }[];
  fmt: (v: number) => string;
  icon: MetricKey;
  unit: string;
}) {
  const zoom = useZoom();
  const total = parts.reduce((a, p) => a + (p.value ?? 0), 0);
  if (!total) return null;
  return (
    <>
      <div className="stack">
        {parts.map((p) =>
          p.value ? <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${fmt(p.value)}`} /> : null,
        )}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label} className={zoom ? "click" : undefined} {...tap(zoom && (() => zoom({ title: p.label, icon, unit, fmt, source: p.src })))}>
            <span className="dot" style={{ background: p.color }} />
            {p.label} <strong>{p.value !== null ? fmt(p.value) : "–"}</strong>{" "}
            <span className="muted">{p.value ? `${fmtNum((p.value / total) * 100)} %` : ""}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function Progress({ icon, label, value, goal, help, src, zoomTitle, bar }: {
  icon: MetricKey;
  label: string;
  value: number;
  goal: number;
  help?: Key;
  src: MetricSource;
  /** Title of the big chart, when it shows something else than the bar, e.g. daily instead of weekly minutes. */
  zoomTitle?: string;
  bar?: boolean;
}) {
  const zoom = useZoom();
  const done = value >= goal;
  return (
    <div className={zoom ? "progress click" : "progress"} {...tap(zoom && (() => zoom({ title: zoomTitle ?? label, icon, fmt: (v) => fmtNum(v), source: src, bar })))}>
      <div className="row">
        <span>
          <MetricIcon m={icon} />
          {label}
          {help && <Info help={help} />}
        </span>
        <span>
          <strong>{fmtNum(value)}</strong> / {fmtNum(goal)}
        </span>
      </div>
      <div className="bar">
        <span style={{ width: `${Math.min(value / goal, 1) * 100}%`, background: done ? "var(--good)" : "var(--s1)" }} />
      </div>
    </div>
  );
}

/** Wall clock of a local-as-UTC timestamp. */
const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

/** Sleep window on a clock axis with the overnight heart rate. */
function NightView({ date, refreshKey }: { date: string; refreshKey: number }) {
  const { t, lang } = useI18n();
  const { data: n } = useApi<Night | null>(`night?date=${date}`, [refreshKey]);
  const option = useCallback(
    (tk: Tokens) => {
      const b = base(tk);
      return {
        ...b,
        // Timestamps already carry the local offset.
        useUTC: true,
        grid: { ...(b.grid as object), top: 8, bottom: 24, left: 36 },
        tooltip: {
          ...(b.tooltip as object),
          formatter: (ps: { value: [number, number] }[]) => `${clock(ps[0].value[0])} · ${ps[0].value[1]} bpm`,
        },
        xAxis: {
          ...(b.xAxis as object),
          type: "time" as const,
          min: n!.hr[0]?.[0] ?? n!.start,
          max: n!.hr.at(-1)?.[0] ?? n!.end,
          axisLabel: { color: tk.muted, fontSize: 11, formatter: (v: number) => clock(v) },
        },
        yAxis: { ...(b.yAxis as object), type: "value" as const },
        series: [
          line(t("day.nightHr"), n!.hr, tk.s2, {
            markArea: {
              silent: true,
              itemStyle: { color: tk.s1, opacity: 0.1 },
              data: [[{ xAxis: n!.start }, { xAxis: n!.end }]],
            },
          }),
        ],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, lang],
  );
  if (!n) return null;
  return (
    <>
      <p className="sub">{t("day.night", { from: clock(n.start), to: clock(n.end), dur: hm((n.end - n.start) / 3_600_000) })}</p>
      {n.hr.length > 1 && <Chart option={option} height={140} expand={t("day.nightHr")} icon="hr" />}
      {n.hrError && <p className="sub">{t("day.nightHrError")}</p>}
    </>
  );
}

/** Heart rate from midnight to midnight, with resting heart rate and the day's activities. */
function DayHrView({ date, refreshKey, rhr, activities }: { date: string; refreshKey: number; rhr: number | null; activities: DayData["activities"] }) {
  const { t, lang, sport } = useI18n();
  const { data: h } = useApi<DayHr | null>(`heartrate?date=${date}`, [refreshKey]);
  const option = useCallback(
    (tk: Tokens) => {
      const b = base(tk);
      const day = Date.parse(date + "T00:00:00Z");
      return {
        ...b,
        // Timestamps already carry the local offset.
        useUTC: true,
        legend: { show: false },
        grid: { ...(b.grid as object), top: 16, bottom: 24, left: 36 },
        tooltip: {
          ...(b.tooltip as object),
          formatter: (ps: { value: [number, number] }[]) => `${clock(ps[0].value[0])} · ${ps[0].value[1]} bpm`,
        },
        xAxis: {
          ...(b.xAxis as object),
          type: "time" as const,
          min: day,
          max: day + 86_400_000,
          interval: 3 * 3_600_000,
          axisLabel: { color: tk.muted, fontSize: 11, formatter: (v: number) => clock(v) },
        },
        // Keep the resting line in view, Garmin's resting value can sit below every 2-minute sample.
        yAxis: { ...(b.yAxis as object), type: "value" as const, min: rhr ? (v: { min: number }) => Math.min(v.min, rhr) - 5 : undefined },
        series: [
          line(t("day.hr"), h?.hr ?? [], tk.s2, {
            lineStyle: { width: 1.5, color: tk.s2 },
            markLine: rhr
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: tk.s1, type: "dashed" as const },
                  label: { formatter: t("day.hrRest", { v: fmtNum(rhr) }), position: "insideStartTop", color: tk.s1, fontSize: 11 },
                  data: [{ yAxis: rhr }],
                }
              : undefined,
            markArea: {
              silent: true,
              itemStyle: { color: tk.s1, opacity: 0.1 },
              label: { color: tk.muted, fontSize: 11, position: "insideTop" },
              data: activities.map((a) => {
                const start = Date.parse(a.start.slice(0, 19) + "Z");
                return [{ xAxis: start, name: a.name || sport(a.type) }, { xAxis: start + a.durationS * 1000 }];
              }),
            },
          }),
        ],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h, rhr, activities, lang],
  );
  if (!h) return null;
  const avg = h.hr.length ? h.hr.reduce((a, x) => a + x[1], 0) / h.hr.length : null;
  return (
    <>
      {avg !== null && <p className="sub">{t("day.hrAvg", { v: fmtNum(avg) })}</p>}
      {h.hr.length > 1 && <Chart option={option} height={200} expand={t("day.hr")} icon="hr" />}
      {h.error && <p className="sub">{t("day.hrError")}</p>}
    </>
  );
}

/** Last night's HRV against Garmin's balanced range. */
function HrvRange({ v, lo, hi }: { v: number; lo: number; hi: number }) {
  const min = Math.min(lo, v) * 0.85;
  const max = Math.max(hi, v) * 1.1;
  const x = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  return (
    <div className="range">
      <div className="track">
        <span className="band" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
        <span className="mark" style={{ left: x(v), background: v < lo ? "var(--critical)" : "var(--s1)" }} />
      </div>
      <div className="ticks">
        <span style={{ left: x(lo) }}>{fmtNum(lo)}</span>
        <span style={{ left: x(hi) }}>{fmtNum(hi)}</span>
      </div>
    </div>
  );
}

export function Day({ refreshKey, date: picked }: PageProps & { date: string | null }) {
  const { t, lang, metric, sport } = useI18n();
  const today = localToday();
  const date = picked && /^\d{4}-\d{2}-\d{2}$/.test(picked) ? picked : today;
  const { data: d, error } = useApi<DayData>(`day?date=${date}`, [refreshKey]);
  const zoom = useMetricZoom(date);

  const m = (k: string) => d?.metrics[k] ?? EMPTY;
  /** A derived series in the same shape as the server's metrics. */
  const derived = (trend: Point[]): DayMetric => {
    const prev = trend.filter((p) => p.date < date && p.date >= shift(date, -7));
    return {
      value: trend.find((p) => p.date === date)?.value ?? null,
      avg7: prev.length ? prev.reduce((a, p) => a + p.value, 0) / prev.length : null,
      baseline: null,
      trend,
    };
  };
  const fromLoad = (f: "load" | "ctl" | "atl" | "tsb" | "acwr") =>
    derived((d?.load ?? []).flatMap((x) => (x[f] === null ? [] : [{ date: x.date, value: x[f] as number }])));
  const vig = new Map(m("intensity_vigorous").trend.map((p) => [p.date, p.value]));
  const intensity = derived(m("intensity_moderate").trend.map((p) => ({ date: p.date, value: p.value + 2 * (vig.get(p.date) ?? 0) })));

  // Weigh-ins are sporadic: fall back to the latest one in the window.
  const w = m("weight");
  const lastW = w.trend.at(-1);
  const weight = w.value === null && lastW ? { ...w, value: lastW.value, avg7: null } : w;

  const loadOption = useCallback(
    (tk: Tokens) => ({
      ...base(tk),
      xAxis: {
        ...(base(tk).xAxis as object),
        type: "category" as const,
        data: d?.load.map((x) => x.date),
        axisLabel: { color: tk.muted, fontSize: 11, formatter: fmtDayShort },
        axisPointer: dateAxisPointer,
      },
      yAxis: { ...(base(tk).yAxis as object), type: "value" as const, scale: false },
      series: [
        {
          type: "bar" as const,
          name: t("training.dailyLoad"),
          barMaxWidth: 16,
          itemStyle: { color: tk.s1 },
          data: d?.load.map((x) => ({ value: x.load, itemStyle: { color: x.date === date ? tk.s1 : tk.axis } })) ?? [],
        },
        line(t("metric.load.ctl"), d?.load.map((x) => [x.date, x.ctl]) ?? [], tk.s3),
        line(t("metric.load.atl"), d?.load.map((x) => [x.date, x.atl]) ?? [], tk.s2),
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, date, lang],
  );

  const hasData = !!d && (Object.values(d.metrics).some((x) => x.value !== null) || d.activities.length > 0);
  const notes = d ? findings(d, t) : [];
  const rd = d?.readiness;
  const hrv = m("hrv_night").value;
  const lo = m("hrv_base_low").value;
  const hi = m("hrv_base_high").value;
  const stepsGoal = m("steps_goal").value;
  const imGoal = m("intensity_goal").value;

  return (
    <DayCtx.Provider value={date}>
    <ZoomCtx.Provider value={zoom.open}>
      {zoom.dialog}
      <div className="grid">
        <div className="card daynav">
          <button className="btn" onClick={() => go(shift(date, -1))} aria-label={t("day.prev")} disabled={!!d?.first && date <= d.first}>
            ‹
          </button>
          <button className="btn" onClick={() => go(shift(date, 1))} aria-label={t("day.next")} disabled={date >= today}>
            ›
          </button>
          <h2 className="dayname">{fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
          <input
            type="date"
            className="input"
            value={date}
            max={today}
            min={d?.first ?? undefined}
            onChange={(e) => e.target.value && go(e.target.value)}
            aria-label={t("day.pick")}
          />
          <button className="btn" onClick={() => go(today)} disabled={date === today}>
            {t("day.today")}
          </button>
        </div>

        {error && <div className="card error">{error}</div>}

        {d && !hasData && (
          <div className="card empty">
            {t("day.empty")}{" "}
            {d.last && d.last !== date && (
              <a href={`#/day/${d.last}`}>{t("day.lastData", { date: fmtDate(d.last) })}</a>
            )}
          </div>
        )}

        {d && hasData && (
          <>
            <div className="card span-4">
              <CardTitle icon="readiness" title={t("overview.readiness")} sub={t("overview.readinessSub")} help="help.readiness" />
              {rd?.score == null ? (
                <div className="empty">{t("overview.readinessEmpty")}</div>
              ) : (
                <>
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
                  <p className="verdict">{t(rd.score >= 65 ? "day.verdict.high" : rd.score < 40 ? "day.verdict.low" : "day.verdict.mid")}</p>
                </>
              )}
            </div>

            <div className="card span-8">
              <CardTitle title={t("day.findings")} sub={t("day.findingsSub")} help="help.day_findings" />
              <ul className="notes">
                {notes.map((n) => (
                  <li key={n.text}>
                    <span className="dot" style={{ background: n.tone === "good" ? "var(--good)" : n.tone === "bad" ? "var(--critical)" : "var(--axis)" }} />
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <CardTitle icon="hr" title={t("day.hr")} sub={t("day.hrSub")} help="help.rhr" />
              <DayHrView date={date} refreshKey={refreshKey} rhr={m("rhr").value} activities={d.activities} />
              <div className="stats">
                <Stat icon="rhr" label={metric("rhr")} m={m("rhr")} src="rhr" intraday unit="bpm" better="down" help="help.rhr" />
                <Stat icon="hrMin" label={metric("hr_min")} m={m("hr_min")} src="hr_min" intraday unit="bpm" />
                <Stat icon="hrMax" label={metric("hr_max")} m={m("hr_max")} src="hr_max" intraday unit="bpm" />
              </div>
            </div>

            <div className="card span-6">
              <CardTitle icon="sleep" title={t("day.sleep")} sub={t("day.sleepSub")} help="help.sleep_stages" />
              <NightView date={date} refreshKey={refreshKey} />
              <Stack
                fmt={hm}
                icon="stages"
                unit="h"
                parts={[
                  { label: t("recovery.deep"), value: m("deep_sleep_hours").value, color: "var(--s1)", src: "deep_sleep_hours" },
                  { label: t("recovery.light"), value: m("light_sleep_hours").value, color: "var(--s3)", src: "light_sleep_hours" },
                  { label: t("recovery.rem"), value: m("rem_sleep_hours").value, color: "var(--s2)", src: "rem_sleep_hours" },
                  { label: t("recovery.awake"), value: m("awake_hours").value, color: "var(--s4)", src: "awake_hours" },
                ]}
              />
              <div className="stats">
                <Stat icon="sleep" label={metric("sleep_hours")} m={m("sleep_hours")} src="sleep_hours" unit="h" fmt={fmtHm} better="up" help="help.sleep" />
                <Stat icon="sleepNeed" label={metric("sleep_need_hours")} m={m("sleep_need_hours")} src="sleep_need_hours" unit="h" fmt={fmtHm} help="help.sleep_need" />
                <Stat icon="sleepScore" label={metric("sleep_score")} m={m("sleep_score")} src="sleep_score" better="up" help="help.sleep_score" />
                <Stat icon="hr" label={metric("sleep_hr")} m={m("sleep_hr")} src="sleep_hr" unit="bpm" better="down" />
                <Stat icon="resp" label={metric("sleep_resp")} m={m("sleep_resp")} src="sleep_resp" unit="brpm" />
                <Stat icon="spo2" label={metric("spo2_avg")} m={m("spo2_avg")} src="spo2_avg" unit="%" />
                <Stat icon="stress" label={metric("sleep_stress")} m={m("sleep_stress")} src="sleep_stress" better="down" />
              </div>
            </div>

            <div className="card span-6">
              <CardTitle icon="hrv" title={t("day.recovery")} sub={t("day.recoverySub")} help="help.hrv_chart" />
              {hrv !== null && lo !== null && hi !== null && (
                <>
                  <p className="sub">{t("day.hrvRange")}</p>
                  <HrvRange v={hrv} lo={lo} hi={hi} />
                </>
              )}
              <div className="stats">
                <Stat icon="hrv" label={metric("hrv_night")} m={m("hrv_night")} src="hrv_night" unit="ms" better="up" help="help.hrv" />
                <Stat icon="hrv" label={metric("hrv_weekly")} m={m("hrv_weekly")} src="hrv_weekly" unit="ms" better="up" />
                <Stat icon="bodyBattery" label={metric("bb_high")} m={m("bb_high")} src="bb_high" better="up" help="help.bb" />
                <Stat icon="bbLow" label={metric("bb_low")} m={m("bb_low")} src="bb_low" better="up" />
                <Stat icon="bodyBattery" label={metric("bb_charged")} m={m("bb_charged")} src="bb_charged" better="up" help="help.bb_flow" />
                <Stat icon="bbDrained" label={metric("bb_drained")} m={m("bb_drained")} src="bb_drained" />
                <Stat
                  icon="weight"
                  label={metric("weight")}
                  m={weight}
                  src="weight"
                  unit="kg"
                  digits={1}
                  help="help.weight"
                  note={w.value === null && lastW ? t("day.lastWeighIn", { date: fmtDayShort(lastW.date) }) : undefined}
                />
              </div>
            </div>

            <div className="card span-6">
              <CardTitle icon="steps" title={t("day.movement")} sub={t("day.movementSub")} />
              {m("steps").value !== null && stepsGoal ? <Progress icon="steps" label={t("day.steps")} value={m("steps").value!} goal={stepsGoal} src="steps" bar /> : null}
              {imGoal ? <Progress icon="intensity" label={t("day.intensityWeek")} value={d.intensityWeek} goal={imGoal} help="help.intensity" src={{ intensity: true }} zoomTitle={t("day.intensityToday")} bar /> : null}
              <div className="stats">
                <Stat icon="steps" label={metric("steps")} m={m("steps")} src="steps" bar better="up" />
                <Stat icon="distance" label={metric("distance_km")} m={m("distance_km")} src="distance_km" bar unit="km" digits={1} better="up" />
                <Stat icon="floors" label={metric("floors")} m={m("floors")} src="floors" bar better="up" />
                <Stat icon="intensity" label={t("day.intensityToday")} m={intensity} src={{ intensity: true }} bar unit="min" better="up" help="help.intensity" />
                <Stat icon="calories" label={metric("calories_total")} m={m("calories_total")} src="calories_total" bar unit="kcal" />
                <Stat icon="calories" label={metric("calories_active")} m={m("calories_active")} src="calories_active" bar unit="kcal" better="up" />
              </div>
            </div>

            <div className="card span-6">
              <CardTitle icon="stress" title={t("day.stress")} sub={t("day.stressSub")} help="help.stress_breakdown" />
              <Stack
                fmt={hm}
                icon="stress"
                unit="h"
                parts={[
                  { label: t("day.stress.rest"), value: m("stress_rest_hours").value, color: "var(--s1)", src: "stress_rest_hours" },
                  { label: t("day.stress.low"), value: m("stress_low_hours").value, color: "var(--s3)", src: "stress_low_hours" },
                  { label: t("day.stress.medium"), value: m("stress_medium_hours").value, color: "var(--s4)", src: "stress_medium_hours" },
                  { label: t("day.stress.high"), value: m("stress_high_hours").value, color: "var(--s2)", src: "stress_high_hours" },
                ]}
              />
              <div className="stats">
                <Stat icon="stress" label={metric("stress_avg")} m={m("stress_avg")} src="stress_avg" better="down" help="help.stress" />
                <Stat icon="stress" label={metric("stress_high_hours")} m={m("stress_high_hours")} src="stress_high_hours" unit="h" fmt={fmtHm} better="down" />
                <Stat icon="rest" label={metric("stress_rest_hours")} m={m("stress_rest_hours")} src="stress_rest_hours" unit="h" fmt={fmtHm} better="up" />
              </div>
            </div>

            <div className="card span-6">
              <CardTitle icon="load" title={t("day.training")} sub={t("day.trainingSub")} help="help.load" />
              <Chart option={loadOption} height={180} expand={t("day.training")} icon="load" />
              <div className="stats">
                <Stat icon="load" label={t("metric.load.load")} m={fromLoad("load")} src={{ load: "load" }} bar />
                <Stat icon="fitness" label={t("metric.load.ctl")} m={fromLoad("ctl")} src={{ load: "ctl" }} better="up" help="help.fitness_fatigue" />
                <Stat icon="fatigue" label={t("metric.load.atl")} m={fromLoad("atl")} src={{ load: "atl" }} />
                <Stat icon="form" label={t("metric.load.tsb")} m={fromLoad("tsb")} src={{ load: "tsb" }} help="help.tsb" />
                <Stat icon="acwr" label={t("training.acwr")} m={fromLoad("acwr")} src={{ load: "acwr" }} digits={2} help="help.acwr" />
              </div>
            </div>

            <div className="card span-6">
              <CardTitle title={t("day.activities")} sub={t("overview.recentCount", { n: d.activities.length })} />
              {d.activities.length ? (
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("activities.name")}</th>
                        <th>{t("day.start")}</th>
                        <th className="num">{t("activities.time")}</th>
                        <th className="num">{t("activities.distance")}</th>
                        <th className="num">{t("activities.avgHr")}</th>
                        <th className="num">{t("activities.load")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.activities.map((a) => (
                        <tr key={a.id} className="click" onClick={() => (location.hash = `#/activities/${a.id}`)}>
                          <td>
                            <div>{a.name || sport(a.type)}</div>
                            <div className="muted" style={{ fontSize: 12 }}>{sport(a.type)}</div>
                          </td>
                          <td>{a.start.slice(11, 16)}</td>
                          <td className="num">{fmtDuration(a.durationS)}</td>
                          <td className="num">{a.distanceM ? `${fmtNum(a.distanceM / 1000, 1)} km` : ""}</td>
                          <td className="num">{a.avgHr ?? ""}</td>
                          <td className="num">{a.load ? Math.round(a.load) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">{t("day.noActivities")}</div>
              )}
            </div>
          </>
        )}
      </div>
    </ZoomCtx.Provider>
    </DayCtx.Provider>
  );
}
