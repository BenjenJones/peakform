import type { StatusDay, TrainingStatusKey } from "./api";
import { fmtDate, fmtNum, type Key, useI18n } from "./i18n";
import { CardTitle } from "./ui";

export const STATUS_COLOR: Record<TrainingStatusKey, string> = {
  peaking: "var(--ts-peaking)",
  productive: "var(--ts-productive)",
  maintaining: "var(--ts-maintaining)",
  recovery: "var(--ts-recovery)",
  unproductive: "var(--ts-unproductive)",
  strained: "var(--ts-strained)",
  overreaching: "var(--ts-overreaching)",
  detraining: "var(--ts-detraining)",
  none: "var(--ts-none)",
};

type Tone = "good" | "bad" | "neutral";
const TONE: Record<Tone, string> = { good: "var(--good)", bad: "var(--critical)", neutral: "var(--axis)" };

/** The inputs behind the status, each with its own verdict. */
function factors(d: StatusDay, t: ReturnType<typeof useI18n>["t"]): { key: string; label: string; value: string; note: string; tone: Tone }[] {
  const out: { key: string; label: string; value: string; note: string; tone: Tone }[] = [];
  if (d.acwr !== null) {
    const [k, tone]: [Key, Tone] =
      d.acwr < 0.8 ? ["ts.load.low", "neutral"] : d.acwr <= 1.3 ? ["ts.load.balanced", "good"] : d.acwr <= 1.5 ? ["ts.load.high", "neutral"] : ["ts.load.veryHigh", "bad"];
    out.push({ key: "load", label: t("ts.f.load"), value: fmtNum(d.acwr, 2), note: t(k), tone });
  }
  if (d.vo2max !== null) {
    const ch = d.vo2Change;
    out.push({
      key: "vo2",
      label: t("ts.f.vo2"),
      value: fmtNum(d.vo2max, 1),
      note: `${t(d.vo2Sport === "ride" ? "ts.vo2.ride" : "ts.vo2.run")} · ${
        ch === null
          ? t("ts.vo2.noTrend")
          : // The dot judges this trend, not the value itself.
            t(d.fitness === "flat" ? "ts.vo2.flat" : "ts.vo2.trend", {
              v: `${ch >= 0 ? "+" : "−"}${fmtNum(Math.abs(ch), 1)}`,
              a: d.fitness === "up" ? "▲" : "▼",
            })
      }`,
      tone: d.fitness === "up" ? "good" : d.fitness === "down" ? "bad" : "neutral",
    });
  } else out.push({ key: "vo2", label: t("ts.f.vo2"), value: "–", note: t("ts.vo2.none"), tone: "neutral" });
  out.push({
    key: "hrv",
    label: t("ts.f.hrv"),
    value: d.hrv ? t(`ts.hrv.${d.hrv}` as Key) : "–",
    note: d.hrv ? t("ts.hrv.note") : t("common.noData"),
    tone: d.hrv === "balanced" ? "good" : d.hrv === "low" || d.hrv === "unbalanced_low" ? "bad" : "neutral",
  });
  out.push({
    key: "rhr",
    label: t("ts.f.rhr"),
    value: d.rhrHigh === null ? "–" : t(d.rhrHigh ? "ts.rhr.high" : "ts.rhr.ok"),
    note: d.rhrHigh === null ? t("common.noData") : t("ts.rhr.note"),
    tone: d.rhrHigh === null ? "neutral" : d.rhrHigh ? "bad" : "good",
  });
  out.push({
    key: "sleep",
    label: t("ts.f.sleep"),
    value: d.sleepPoor === null ? "–" : t(d.sleepPoor ? "ts.sleep.poor" : "ts.sleep.ok"),
    note: d.sleepPoor === null ? t("common.noData") : t("ts.sleep.note"),
    tone: d.sleepPoor === null ? "neutral" : d.sleepPoor ? "bad" : "good",
  });
  return out;
}

/** Current status with its reasons, and the status of every day before it as a strip. */
export function TrainingStatusCard({ days, className = "card", detailed = true }: { days: StatusDay[] | null; className?: string; detailed?: boolean }) {
  const { t } = useI18n();
  const today = days?.at(-1);
  const seen = [...new Set(days?.map((d) => d.status))];
  return (
    <div className={className}>
      <CardTitle icon="form" title={t("ts.title")} sub={detailed ? t("ts.sub") : undefined} help="help.training_status" />
      {!today ? null : today.status === "none" && seen.length === 1 ? (
        <div className="empty">{t("ts.empty")}</div>
      ) : (
        <>
          <div className="ts-hero">
            <div className="ts-main">
              <div className="ts-name">
                <span className="dot" style={{ background: STATUS_COLOR[today.status] }} />
                {t(`ts.s.${today.status}` as Key)}
              </div>
              <p className="ts-desc">{t(`ts.d.${today.status}` as Key)}</p>
            </div>
            <div className="ts-factors">
              {factors(today, t).map((f) => (
                <div key={f.key}>
                  <div className="k">{f.label}</div>
                  <div className="v">
                    <span className="dot" style={{ background: TONE[f.tone] }} />
                    {f.value}
                  </div>
                  {detailed && <div className="n">{f.note}</div>}
                </div>
              ))}
            </div>
          </div>
          {days!.length > 1 && (
            <>
              <div className="ts-strip" role="img" aria-label={t("ts.history", { n: days!.length })}>
                {days!.map((d) => (
                  <span key={d.date} style={{ background: STATUS_COLOR[d.status] }} title={`${fmtDate(d.date)} · ${t(`ts.s.${d.status}` as Key)}`} />
                ))}
              </div>
              <div className="ts-axis">
                <span>{fmtDate(days![0].date)}</span>
                <span>{fmtDate(today.date)}</span>
              </div>
              <div className="legend">
                {seen.map((s) => (
                  <span key={s}>
                    <span className="dot" style={{ background: STATUS_COLOR[s] }} />
                    {t(`ts.s.${s}` as Key)}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
