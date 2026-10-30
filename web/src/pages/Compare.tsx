import { useCallback, useMemo, useState } from "react";
import { type CompareCandidate, type CompareCandidates, type Comparison, fmtDuration, fmtPace, useApi } from "../api";
import { base, Chart, line, type Tokens } from "../Chart";
import { fmtDate, fmtNum, useI18n } from "../i18n";
import { latLons, positionAt, TrackMap } from "../RouteMap";
import { CardTitle, Info } from "../ui";

const fmtStart = (s: string) => `${fmtDate(s)} ${s.slice(11, 16)}`;
/** Signed duration: "+1:23", "−0:05". */
const signed = (s: number) => `${s > 0 ? "+" : s < 0 ? "−" : "±"}${fmtDuration(Math.abs(s))}`;
/** Grid index nearest to `km` (grid is ascending). */
function nearest(xs: number[], km: number) {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && km - xs[lo - 1] < xs[lo] - km ? lo - 1 : lo;
}
const go = (a: number, b: number) => (location.hash = `#/activities/${a}/compare/${b}`);

/** "Compare with…" select on the activity page: likely same route first, then the rest of the sport. */
export function ComparePicker({ id }: { id: number }) {
  const { t } = useI18n();
  const { data } = useApi<CompareCandidates>(`activities/${id}/candidates`);
  if (!data || (!data.similar.length && !data.others.length)) return null;
  const option = (c: CompareCandidate) => (
    <option key={c.id} value={c.id}>
      {[fmtStart(c.start), c.name, c.distanceM ? `${fmtNum(c.distanceM / 1000, 2)} km` : null, c.movingS ? fmtDuration(c.movingS) : null]
        .filter(Boolean)
        .join(" · ")}
    </option>
  );
  return (
    <label className="controls compare-pick">
      {t("compare.with")}
      <select value="" onChange={(e) => e.target.value && go(id, Number(e.target.value))}>
        <option value="">{t("compare.choose", { n: data.similar.length })}</option>
        {!!data.similar.length && <optgroup label={t("compare.similar")}>{data.similar.map(option)}</optgroup>}
        {!!data.others.length && <optgroup label={t("compare.others")}>{data.others.map(option)}</optgroup>}
      </select>
    </label>
  );
}

export function Compare({ a: idA, b: idB }: { a: number; b: number }) {
  const { t, lang, sport } = useI18n();
  const { data: c, error } = useApi<Comparison>(`compare?a=${idA}&b=${idB}`);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // B dashed on top of A, so both stay visible where the routes overlap.
  const tracks = useMemo(
    () =>
      c
        ? [
            { points: latLons(c.profiles.a.lat, c.profiles.a.lon), lineClass: "route-line", hoverClass: "route-hover-a" },
            { points: latLons(c.profiles.b.lat, c.profiles.b.lon), lineClass: "route-line b", hoverClass: "route-hover-b" },
          ]
        : [],
    [c],
  );
  const hover = useMemo(() => {
    if (!c || hoverX === null) return [null, null];
    const i = nearest(c.x, hoverX);
    return [positionAt(c.profiles.a.lat, c.profiles.a.lon, i), positionAt(c.profiles.b.lat, c.profiles.b.lon, i)];
  }, [c, hoverX]);
  const hasMap = tracks.some((t) => t.points.length >= 2);

  const chart = useCallback(
    (key: "speed" | "hr" | "power" | "alt" | "delta", fmt?: (v: number) => string) => (tk: Tokens) => {
      const b = base(tk);
      const xy = (ys: (number | null)[]) => c!.x.map((x, i) => [x, ys[i]]);
      const series =
        key === "delta"
          ? [
              line(t("compare.lead"), xy(c!.delta), tk.s1, {
                areaStyle: { color: tk.s1, opacity: 0.15 },
                markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: tk.axis, type: "solid" }, data: [{ yAxis: 0 }] },
              }),
            ]
          : [line("A", xy(c!.profiles.a[key]), tk.s1), line("B", xy(c!.profiles.b[key]), tk.s2)];
      return {
        ...b,
        grid: { ...(b.grid as object), top: key === "delta" ? 8 : 24, bottom: 24 },
        legend: { ...(b.legend as object), show: key !== "delta" },
        tooltip: { ...(b.tooltip as object), valueFormatter: (v: unknown) => (fmt ? fmt(Number(v)) : fmtNum(Number(v))) },
        xAxis: {
          ...(b.xAxis as object),
          type: "value" as const,
          min: 0,
          max: "dataMax",
          axisLabel: { color: tk.muted, formatter: (v: number) => `${fmtNum(v, v % 1 ? 1 : 0)} km` },
          axisPointer: { label: { formatter: ({ value }: { value: number }) => `${fmtNum(value, 2)} km` } },
        },
        yAxis: {
          ...(b.yAxis as object),
          type: "value" as const,
          axisLabel: { color: tk.muted, formatter: fmt ? (v: number) => fmt(v).replace(" /km", "") : undefined },
        },
        series,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, lang],
  );

  const charts = useMemo(() => {
    if (!c) return [];
    const both = (k: "speed" | "hr" | "power" | "alt") => [c.profiles.a, c.profiles.b].every((p) => p[k].some((v) => (v ?? 0) > 0));
    const out: { title: string; option: (tk: Tokens) => object }[] = [];
    if (both("speed")) out.push({ title: t("activities.paceChart"), option: chart("speed", fmtPace) });
    if (both("hr")) out.push({ title: t("activities.hrChart"), option: chart("hr") });
    if (both("power")) out.push({ title: t("activities.powerChart"), option: chart("power") });
    if (both("alt")) out.push({ title: t("activities.elevChart"), option: chart("alt") });
    return out;
  }, [c, chart, lang]);

  if (error) return <div className="card error">{t("compare.notComparable")}</div>;
  if (!c) return <div className="empty">{t("common.loading")}</div>;

  const rows = [
    { tag: "A", color: "var(--s1)", s: c.a },
    { tag: "B", color: "var(--s2)", s: c.b },
  ];
  const lead = c.delta.at(-1) ?? 0;
  const n = Math.max(c.splits.a.length, c.splits.b.length);

  return (
    <div className="grid">
      <div className="card">
        <div className="controls" style={{ justifyContent: "space-between" }}>
          <a href={`#/activities/${c.a.id}`} className="muted">
            {t("compare.back")}
          </a>
          <a className="btn" href={`#/activities/${c.b.id}/compare/${c.a.id}`}>
            {t("compare.swap")}
          </a>
        </div>
        <h2 style={{ fontSize: 18, marginTop: 6 }}>{t("compare.title")}</h2>
        <p className="sub">
          {sport(c.a.type)} ·{" "}
          {lead === 0 ? t("compare.tie") : t(lead > 0 ? "compare.aFaster" : "compare.bFaster", { d: fmtDuration(Math.abs(lead)) })}
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th />
                <th>{t("activities.name")}</th>
                <th className="num">{t("activities.distance")}</th>
                <th className="num">
                  {t("compare.moving")}
                  <Info help="help.compare_moving" />
                </th>
                <th className="num">{t("activities.pace")}</th>
                <th className="num">{t("activities.avgHr")}</th>
                <th className="num">{t("activities.avgW")}</th>
                <th className="num">{t("activities.elev")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tag, color, s }) => (
                <tr key={tag} className="click" onClick={() => (location.hash = `#/activities/${s.id}`)}>
                  <td>
                    <span className="dot" style={{ background: color }} /> <strong>{tag}</strong>
                  </td>
                  <td>
                    <div>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{fmtStart(s.start)}</div>
                  </td>
                  <td className="num">{fmtNum(s.distanceM / 1000, 2)} km</td>
                  <td className="num">{fmtDuration(s.movingS)}</td>
                  <td className="num">{s.movingS ? fmtPace(s.distanceM / s.movingS) : ""}</td>
                  <td className="num">{s.avgHr ?? ""}</td>
                  <td className="num">{s.avgPower ?? ""}</td>
                  <td className="num">{s.elevGainM ? `${Math.round(s.elevGainM)} m` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <CardTitle title={t("compare.lead")} sub={t("compare.leadSub")} help="help.compare_lead" />
        <Chart option={chart("delta", signed)} height={180} group="cmp" onHover={setHoverX} />
      </div>

      {hasMap && (
        <div className="card span-4 route-card">
          <h2>{t("activities.route")}</h2>
          <TrackMap tracks={tracks} hover={hover} />
          <div className="legend" style={{ marginTop: 8 }}>
            <span>
              <span className="dot" style={{ background: "var(--s1)" }} /> A
            </span>
            <span>
              <span className="dot" style={{ background: "var(--s2)" }} /> B
            </span>
          </div>
        </div>
      )}

      <div className={`card ${hasMap ? "span-8" : ""}`}>
        {charts.map((ch) => (
          <div key={ch.title}>
            <h2>{ch.title}</h2>
            <Chart option={ch.option} height={150} group="cmp" onHover={setHoverX} />
          </div>
        ))}
      </div>

      <div className="card scroll">
        <CardTitle title={t("compare.splits")} sub={t("compare.splitsSub")} />
        <table>
          <thead>
            <tr>
              <th>km</th>
              <th className="num">A</th>
              <th className="num">B</th>
              <th className="num">Δ</th>
              <th className="num">♥ A</th>
              <th className="num">♥ B</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => {
              const sa = c.splits.a[i];
              const sb = c.splits.b[i];
              // Partial last kilometres differ in length; their times are not comparable.
              const d = sa && sb && Math.abs(sa.lengthM - sb.lengthM) < 50 ? sb.timeS - sa.timeS : null;
              const partial = (sa ?? sb)!.lengthM < 950;
              return (
                <tr key={i}>
                  <td>{partial ? `${fmtNum((sa ?? sb)!.lengthM / 1000, 2)}` : i + 1}</td>
                  <td className="num">{sa ? fmtDuration(sa.timeS) : ""}</td>
                  <td className="num">{sb ? fmtDuration(sb.timeS) : ""}</td>
                  <td className="num" style={{ color: d === null || d === 0 ? undefined : d > 0 ? "var(--up)" : "var(--critical)" }}>
                    {d === null ? "" : signed(d)}
                  </td>
                  <td className="num">{sa?.avgHr ?? ""}</td>
                  <td className="num">{sb?.avgHr ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
