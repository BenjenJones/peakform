import { useState } from "react";
import type { PageProps } from "../App";
import { useApi } from "../api";
import { fmtDate, type Key, locale, useI18n } from "../i18n";
import { CardTitle } from "../ui";

interface MetricsInfo {
  curated: { key: string; candidates: string[]; resolved: string | null }[];
  raw: { metric: string; n: number; first: string; last: string }[];
}

const ENDPOINTS = ["daily_summaries", "sleep_summaries", "hrv", "stress", "steps", "body_battery", "weight"];

/** Sync health plus a raw-field browser for mapping Garmin's (undocumented) payloads. */
export function Data({ status, refreshKey }: PageProps) {
  const { t, metric } = useI18n();
  const { data: m } = useApi<MetricsInfo>("metrics", [refreshKey]);
  const [ep, setEp] = useState(ENDPOINTS[0]);
  const { data: raw, error: rawErr } = useApi<{ start_date: string; end_date: string; payload: unknown }>(`raw/${ep}`, [refreshKey]);
  const [q, setQ] = useState("");

  return (
    <div className="grid">
      <div className="card span-6">
        <h2>{t("data.sync")}</h2>
        {status && (
          <table>
            <tbody>
              <tr><td>{t("data.days")}</td><td className="num">{status.counts.days}</td></tr>
              <tr><td>{t("data.metrics")}</td><td className="num">{status.counts.metrics}</td></tr>
              <tr><td>{t("data.activities")}</td><td className="num">{status.counts.activities}</td></tr>
              <tr><td>{t("data.fitPending")}</td><td className="num">{status.counts.fitPending}</td></tr>
              <tr><td>{t("data.fitFailed")}</td><td className="num">{status.counts.fitErrors}</td></tr>
            </tbody>
          </table>
        )}
        <h2 style={{ marginTop: 16 }}>{t("data.runs")}</h2>
        <table>
          <tbody>
            {status?.lastSyncs.map((s, i) => (
              <tr key={i}>
                <td>{new Date(s.started).toLocaleString(locale())}</td>
                <td>{t(`sync.status.${s.status}` as Key)}</td>
                <td className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{s.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card span-6">
        <CardTitle title={t("data.mapping")} sub={t("data.mappingSub")} help="help.mapping" />
        <table>
          <tbody>
            {m?.curated.map((c) => (
              <tr key={c.key}>
                <td>{metric(c.key)}</td>
                <td className={c.resolved ? "" : "muted"} style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {c.resolved ?? `${t("data.unresolved")} (${c.candidates.join(", ")})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card span-6">
        <h2>{t("data.raw")}</h2>
        <input placeholder={t("data.filter")} value={q} onChange={(e) => setQ(e.target.value)} className="input" />
        <div className="scroll" style={{ maxHeight: 480, overflowY: "auto" }}>
          <table>
            <thead><tr><th>{t("data.metric")}</th><th className="num">{t("data.daysCol")}</th><th>{t("data.range")}</th></tr></thead>
            <tbody>
              {m?.raw.filter((r) => r.metric.toLowerCase().includes(q.toLowerCase())).map((r) => (
                <tr key={r.metric}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.metric}</td>
                  <td className="num">{r.n}</td>
                  <td className="muted">{fmtDate(r.first)} → {fmtDate(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card span-6">
        <h2>{t("data.payload")}</h2>
        <select value={ep} onChange={(e) => setEp(e.target.value)} aria-label="Endpoint" style={{ marginBottom: 8 }}>
          {ENDPOINTS.map((e) => <option key={e}>{e}</option>)}
        </select>
        {rawErr ? <div className="empty">{t("data.noData", { ep })}</div> : (
          <>
            <p className="sub">{raw ? t("data.latest", { from: fmtDate(raw.start_date), to: fmtDate(raw.end_date) }) : ""}</p>
            <pre className="raw">{JSON.stringify(raw?.payload, null, 2)?.slice(0, 20000)}</pre>
          </>
        )}
      </div>
    </div>
  );
}
