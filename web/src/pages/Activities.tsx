import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { PageProps } from "../App";
import { type ActivityLite, daysAgo, fmtCurveDuration, fmtDuration, fmtPace, isRun, type Streams, useApi } from "../api";
import { base, Chart, limitLine, line, maxWithLimit, type Tokens } from "../Chart";
import { fmtDate, fmtNum, type Key, useI18n } from "../i18n";
import { RouteMap } from "../RouteMap";
import { CardTitle, Info } from "../ui";
import { Compare, ComparePicker } from "./Compare";

/** "2026-10-20T07:00:00" (local time from Garmin) -> "20.10.2026 07:00" */
const fmtStart = (s: string) => `${fmtDate(s)} ${s.slice(11, 16)}`;

interface Detail {
  id: number; name: string; type: string; start: string; fitStatus: string; fitError: string | null;
  summary: Record<string, unknown>;
  detail: { laps?: Record<string, number>[] } | null;
  streams: Streams | null;
  curves: Record<"power" | "speed" | "hr", { durationS: number; value: number }[]> | null;
  decoupling: Decoupling | null;
  hrLimit: number | null;
}

/** Output per heartbeat: metres (pace basis) or watts per bpm (power basis). */
interface Decoupling {
  pct: number;
  basis: "speed" | "power";
  splitT: number;
  halves: { out: number; hr: number; ef: number }[];
  series: [number, number][];
}

/** Gaps longer than this are pauses; mirrors the server's decoupling weighting. */
const MAX_GAP_S = 30;

/** Seconds spent above `limit` bpm and the share of recorded time. */
function timeAbove(s: Streams, limit: number) {
  let above = 0;
  let total = 0;
  for (let i = 0; i < s.t.length - 1; i++) {
    const h = s.hr[i];
    if (!h) continue;
    const dt = Math.min(s.t[i + 1] - s.t[i], MAX_GAP_S);
    total += dt;
    if (h > limit) above += dt;
  }
  return { above, pct: total ? (above / total) * 100 : 0 };
}

/** Mean over records with a value, e.g. cadence while moving (0 while standing). */
function meanPositive(v: (number | null)[]) {
  let sum = 0;
  let n = 0;
  for (const x of v) {
    if (x && x > 0) {
      sum += x;
      n++;
    }
  }
  return n ? sum / n : null;
}

export function Activities({ range, refreshKey, selectedId, compareId }: PageProps & { selectedId: number | null; compareId: number | null }) {
  const { t, sport } = useI18n();
  const { data: acts } = useApi<ActivityLite[]>(`activities?from=${daysAgo(range)}`, [refreshKey]);
  const [filter, setFilter] = useState("");
  const types = useMemo(() => [...new Set(acts?.map((a) => a.type))].sort(), [acts]);
  const shown = acts?.filter((a) => !filter || a.type === filter);

  if (selectedId && compareId) return <Compare a={selectedId} b={compareId} />;
  if (selectedId) return <ActivityDetail id={selectedId} />;

  return (
    <div className="grid">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <CardTitle title={t("activities.title")} sub={t("activities.inRange", { n: shown?.length ?? 0 })} />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("activities.sport")}>
            <option value="">{t("training.allSports")}</option>
            {types.map((ty) => (
              <option key={ty} value={ty}>
                {sport(ty)}
              </option>
            ))}
          </select>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t("activities.date")}</th><th>{t("activities.name")}</th><th>{t("activities.sport")}</th>
                <th className="num">{t("activities.time")}</th><th className="num">{t("activities.distance")}</th><th className="num">{t("activities.avgHr")}</th>
                <th className="num">{t("activities.avgW")}</th><th className="num">{t("activities.elev")}</th>
                <th className="num">{t("activities.load")}<Info help="help.load" /></th>
              </tr>
            </thead>
            <tbody>
              {shown?.map((a) => (
                <tr key={a.id} className="click" onClick={() => (location.hash = `#/activities/${a.id}`)}>
                  <td>{fmtStart(a.start)}</td>
                  <td>{a.name}</td>
                  <td className="muted">{sport(a.type)}</td>
                  <td className="num">{fmtDuration(a.durationS)}</td>
                  <td className="num">{a.distanceM ? fmtNum(a.distanceM / 1000, 2) + " km" : ""}</td>
                  <td className="num">{a.avgHr ? Math.round(a.avgHr) : ""}</td>
                  <td className="num">{a.avgPower ? Math.round(a.avgPower) : ""}</td>
                  <td className="num">{a.elevGainM ? Math.round(a.elevGainM) + " m" : ""}</td>
                  <td className="num" title={a.loadSource}>{a.load ? Math.round(a.load) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Downsample streams for plotting; per-second data for multi-hour rides is too dense. */
function thin(s: Streams, target = 2000) {
  const step = Math.max(1, Math.floor(s.t.length / target));
  const idx = s.t.map((_, i) => i).filter((i) => i % step === 0);
  const pick = <T,>(a: T[]) => idx.map((i) => a[i]);
  return { t: pick(s.t), hr: pick(s.hr), power: pick(s.power), speed: pick(s.speed), alt: pick(s.alt), cadence: pick(s.cadence) };
}

function ActivityDetail({ id }: { id: number }) {
  const { t: tr, lang, sport } = useI18n();
  const { data: a, error } = useApi<Detail>(`activities/${id}`);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const thinned = useMemo(() => (a?.streams ? thin(a.streams) : null), [a]);
  const run = isRun(a?.type);

  const streamChart = useCallback(
    (key: "hr" | "power" | "speed" | "alt" | "cadence", name: string, colorKey: keyof Tokens, fmt?: (v: number) => string, limit: number | null = null) =>
      (t: Tokens) => {
        const b = base(t);
        return {
          ...b,
          grid: { ...(b.grid as object), top: 8, bottom: 24 },
          legend: { show: false },
          tooltip: { ...(b.tooltip as object), valueFormatter: (v: unknown) => (fmt ? fmt(Number(v)) : fmtNum(Number(v))) },
          xAxis: {
            ...(b.xAxis as object),
            type: "value" as const,
            max: "dataMax",
            axisLabel: { color: t.muted, formatter: (v: number) => fmtDuration(v) },
            // Also formats the tooltip header (elapsed time instead of raw seconds).
            axisPointer: { label: { formatter: ({ value }: { value: number }) => fmtDuration(value) } },
          },
          yAxis: {
            ...(b.yAxis as object),
            type: "value" as const,
            max: maxWithLimit(limit),
            axisLabel: { color: t.muted, formatter: fmt ? (v: number) => fmt(v).replace(" /km", "") : undefined },
          },
          series: [
            line(name, thinned!.t.map((x, i) => [x, thinned![key][i]]), t[colorKey], {
              sampling: "lttb",
              ...(limit ? { markLine: limitLine(limit, t.serious, tr("activities.hrLimitLabel", { bpm: limit })) } : {}),
            }),
          ],
        };
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thinned, lang],
  );

  const charts = useMemo(() => {
    if (!thinned || !a) return [];
    const has = (k: keyof typeof thinned) => thinned[k].some((v) => (v ?? 0) > 0);
    const out: { title: string; option: (t: Tokens) => object; action?: ReactNode }[] = [];
    if (has("hr"))
      out.push({
        title: tr("activities.hrChart"),
        option: streamChart("hr", tr("training.hr"), "s2", undefined, a.hrLimit),
        action: a.hrLimit ? null : (
          <a href="#/account" className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
            {tr("activities.setHrLimit")}
          </a>
        ),
      });
    if (has("power")) out.push({ title: tr("activities.powerChart"), option: streamChart("power", tr("training.power"), "s1") });
    if (has("speed")) out.push({ title: tr("activities.paceChart"), option: streamChart("speed", tr("activities.pace"), "s3", fmtPace) });
    if (run && has("cadence")) out.push({ title: tr("activities.cadenceChart"), option: streamChart("cadence", tr("activities.cadence"), "s1") });
    if (has("alt")) out.push({ title: tr("activities.elevChart"), option: streamChart("alt", tr("activities.alt"), "s4") });
    return out;
  }, [thinned, streamChart, a, run, lang]);

  const dec = a?.decoupling;
  const decOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      const d = dec!;
      const end = a!.streams!.t.at(-1) ?? d.splitT;
      const segment = (from: number, to: number, y: number) => [{ coord: [from, y] }, { coord: [to, y] }];
      return {
        ...b,
        grid: { ...(b.grid as object), top: 8, bottom: 24 },
        legend: { show: false },
        tooltip: { ...(b.tooltip as object), valueFormatter: (v: unknown) => fmtNum(Number(v), 2) },
        xAxis: {
          ...(b.xAxis as object),
          type: "value" as const,
          min: 0,
          max: end,
          axisLabel: { color: t.muted, formatter: (v: number) => fmtDuration(v) },
          axisPointer: { label: { formatter: ({ value }: { value: number }) => fmtDuration(value) } },
        },
        yAxis: { ...(b.yAxis as object), type: "value" as const, axisLabel: { color: t.muted, formatter: (v: number) => fmtNum(v, 2) } },
        series: [
          line(tr(d.basis === "speed" ? "activities.efPace" : "activities.efPower"), d.series, t.s3, {
            // Mean of each half, and where the second half starts.
            markLine: {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: t.ink2, type: "dashed" },
              data: [
                segment(0, d.splitT, d.halves[0].ef),
                segment(d.splitT, end, d.halves[1].ef),
                { xAxis: d.splitT, lineStyle: { color: t.axis, type: "solid" } },
              ],
            },
          }),
        ],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, dec, lang],
  );

  const curveField = a?.curves?.power.length ? "power" : a?.curves?.speed.length ? "speed" : "hr";
  const curveOpt = useCallback(
    (t: Tokens) => {
      const b = base(t);
      const fmt = (v: number) => (curveField === "speed" ? fmtPace(v) : fmtNum(v));
      return {
        ...b,
        legend: { show: false },
        tooltip: { ...(b.tooltip as object), valueFormatter: (v: unknown) => fmt(Number(v)) },
        xAxis: { ...(b.xAxis as object), type: "category" as const, boundaryGap: false },
        yAxis: { ...(b.yAxis as object), type: "value" as const },
        series: [line(tr(`training.${curveField}`), a?.curves?.[curveField].map((p) => [fmtCurveDuration(p.durationS), p.value]) ?? [], t.s1, { showSymbol: true })],
      };
    },
    [a, curveField, lang],
  );

  if (error) return <div className="card">{error}</div>;
  if (!a) return <div className="empty">{tr("common.loading")}</div>;
  const s = a.summary as Record<string, number>;
  const cadence = run && a.streams ? meanPositive(a.streams.cadence) : null;
  const above = a.hrLimit && a.streams?.hr.some((h) => h) ? timeAbove(a.streams, a.hrLimit) : null;
  const fmtOut = (v: number) => (dec?.basis === "speed" ? fmtPace(v) : `${fmtNum(v)} W`);

  return (
    <div className="grid">
      <div className="card">
        <a href="#/activities" className="muted">{tr("activities.back")}</a>
        <h2 style={{ fontSize: 18, marginTop: 6 }}>{a.name}</h2>
        <p className="sub">{fmtStart(a.start)} · {sport(a.type ?? "")}</p>
        {a.streams?.dist.some((v) => (v ?? 0) > 0) && <ComparePicker id={id} />}
        <div className="tiles">
          <Tile label={tr("activities.time")} value={fmtDuration(s.movingDuration ?? s.duration ?? 0)} />
          {s.distance ? <Tile label={tr("activities.distance")} value={fmtNum(s.distance / 1000, 2)} unit="km" /> : null}
          {s.averageHR ? <Tile label={tr("activities.avgHr")} value={fmtNum(s.averageHR)} unit="bpm" /> : null}
          {s.avgPower ? <Tile label={tr("activities.avgPower")} value={fmtNum(s.avgPower)} unit="W" /> : null}
          {s.normPower ? <Tile label={tr("activities.np")} value={fmtNum(s.normPower)} unit="W" help="help.np" /> : null}
          {s.elevationGain ? <Tile label={tr("activities.elev")} value={fmtNum(s.elevationGain)} unit="m" /> : null}
          {cadence ? <Tile label={tr("activities.cadence")} value={fmtNum(cadence)} unit={tr("activities.spm")} help="help.cadence" /> : null}
          {above ? (
            <Tile
              label={tr("activities.aboveLimit")}
              value={fmtDuration(above.above)}
              hint={tr("activities.aboveLimitHint", { pct: fmtNum(above.pct), bpm: a.hrLimit! })}
              help="help.hr_limit"
            />
          ) : null}
          {dec ? (
            <Tile
              label={tr("activities.decoupling")}
              value={fmtNum(dec.pct, 1)}
              unit="%"
              hint={dec.pct < 5 ? tr("activities.steady") : tr("activities.drifted")}
              help="help.decoupling"
            />
          ) : null}
          {s.aerobicTrainingEffect ? <Tile label={tr("activities.aerobicTe")} value={fmtNum(s.aerobicTrainingEffect, 1)} help="help.aerobic_te" /> : null}
          {s.activityTrainingLoad ? <Tile label={tr("activities.load")} value={fmtNum(s.activityTrainingLoad)} help="help.load" /> : null}
        </div>
      </div>

      {a.fitStatus !== "ok" && (
        <div className="card">
          {tr("activities.fitStatus", { status: a.fitStatus, error: a.fitError ? `: ${a.fitError}` : "" })}
        </div>
      )}

      {a.streams && a.streams.lat.some((v) => v !== null) && (
        <div className="card span-4 route-card">
          <h2>{tr("activities.route")}</h2>
          <RouteMap streams={a.streams} hoverT={hoverT} />
        </div>
      )}

      <div className={`card ${a.streams?.lat.some((v) => v !== null) ? "span-8" : ""}`}>
        {charts.map((c) => (
          <div key={c.title}>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              {c.title}
              {c.action}
            </h2>
            <Chart option={c.option} height={150} group={`act-${id}`} onHover={setHoverT} />
          </div>
        ))}
        {!charts.length && <div className="empty">{tr("activities.noStreams")}</div>}
      </div>

      {dec && (
        <div className="card span-6 scroll">
          <CardTitle
            title={`${tr("activities.decoupling")}: ${fmtNum(dec.pct, 1)} %`}
            sub={tr(dec.basis === "speed" ? "activities.decouplingSubPace" : "activities.decouplingSubPower")}
            help="help.decoupling"
          />
          <Chart option={decOpt} height={180} group={`act-${id}`} onHover={setHoverT} />
          <table>
            <thead>
              <tr>
                <th />
                <th className="num">{tr("activities.time")}</th>
                <th className="num">{tr(dec.basis === "speed" ? "activities.pace" : "training.power")}</th>
                <th className="num">{tr("activities.avgHr")}</th>
                <th className="num">{tr(dec.basis === "speed" ? "activities.efPace" : "activities.efPower")}</th>
              </tr>
            </thead>
            <tbody>
              {dec.halves.map((h, i) => (
                <tr key={i}>
                  <td>{tr(i ? "activities.secondHalf" : "activities.firstHalf")}</td>
                  <td className="num">{i ? `${fmtDuration(dec.splitT)}–${fmtDuration(a.streams!.t.at(-1)!)}` : `0:00–${fmtDuration(dec.splitT)}`}</td>
                  <td className="num">{fmtOut(h.out)}</td>
                  <td className="num">{fmtNum(h.hr)}</td>
                  <td className="num">{fmtNum(h.ef, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!!a.curves?.[curveField].length && (
        <div className="card span-6">
          <CardTitle title={`${tr("activities.curve")} (${tr(`training.${curveField}`)})`} sub={tr("activities.curveSub")} help="help.meanmax" />
          <Chart option={curveOpt} height={220} />
        </div>
      )}

      {!!a.detail?.laps?.length && (
        <div className="card span-6 scroll">
          <h2>{tr("activities.laps")}</h2>
          <table>
            <thead>
              <tr>
                <th>#</th><th className="num">{tr("activities.time")}</th><th className="num">km</th><th className="num">{tr("activities.avgHr")}</th>
                <th className="num">{tr("activities.avgW")}</th><th className="num">{tr("activities.pace")}</th>
              </tr>
            </thead>
            <tbody>
              {a.detail.laps.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="num">{fmtDuration(l.totalTimerTime ?? 0)}</td>
                  <td className="num">{l.totalDistance ? fmtNum(l.totalDistance / 1000, 2) : ""}</td>
                  <td className="num">{l.avgHeartRate ?? ""}</td>
                  <td className="num">{l.avgPower ?? ""}</td>
                  <td className="num">{l.enhancedAvgSpeed ? fmtPace(l.enhancedAvgSpeed) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, unit, hint, help }: { label: string; value: string | number; unit?: string; hint?: string; help?: Key }) {
  return (
    <div className="tile">
      <div className="label">
        {label}
        {help && <Info help={help} />}
      </div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && <div className="delta">{hint}</div>}
    </div>
  );
}
