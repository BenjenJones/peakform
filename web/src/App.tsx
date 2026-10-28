import { useEffect, useState } from "react";
import { api, type Me } from "./api";
import { I18nProvider, type Key, type Lang, useI18n } from "./i18n";
import { Account } from "./pages/Account";
import { Activities } from "./pages/Activities";
import { Data } from "./pages/Data";
import { Insights } from "./pages/Insights";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Recovery } from "./pages/Recovery";
import { Training } from "./pages/Training";

// Hash routing: no server-side route knowledge needed behind the ingress proxy.
const TABS = ["overview", "recovery", "training", "activities", "insights", "data", "account"] as const;

export interface Status {
  configured: boolean;
  sync: { running: boolean; step: string; errors: string[]; lastRun: { finished: string; status: string } | null };
  counts: { days: number; metrics: number; activities: number; fitPending: number; fitErrors: number };
  lastSyncs: { started: string; finished: string | null; status: string; message: string | null }[];
}

function useHash() {
  const [hash, setHash] = useState(location.hash.slice(2));
  useEffect(() => {
    const on = () => setHash(location.hash.slice(2));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  return (
    <I18nProvider>
      <Root />
    </I18nProvider>
  );
}

function Root() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const loadMe = () => api<Me>("me").then(setMe, () => setMe(null));
  useEffect(() => {
    loadMe();
    const on = () => setMe(null);
    addEventListener("unauthenticated", on);
    return () => removeEventListener("unauthenticated", on);
  }, []);

  if (me === undefined) return null;
  if (me === null) return <Login onDone={loadMe} />;
  // Keyed by user so no state leaks between accounts.
  return <Dashboard key={me.id} me={me} reloadMe={loadMe} />;
}

function Dashboard({ me, reloadMe }: { me: Me; reloadMe: () => void }) {
  const hash = useHash();
  const [tab, ...rest] = hash.split("/");
  const [range, setRange] = useState(() => Number(localStorageGet("range") ?? 90));
  const [status, setStatus] = useState<Status | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let wasRunning = false;
    const poll = () =>
      api<Status>("status")
        .then((s) => {
          setStatus(s);
          // New data landed: re-fetch the pages.
          if (wasRunning && !s.sync.running) setRefreshKey((k) => k + 1);
          wasRunning = s.sync.running;
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  const setRangePersist = (n: number) => {
    setRange(n);
    try {
      localStorage.setItem("range", String(n));
    } catch {}
  };

  const { t, lang, setLang } = useI18n();
  const active = TABS.find((id) => id === tab) ?? "overview";
  const props = { range, refreshKey, status };

  return (
    <div className="shell">
      <header className="top">
        <h1>PeakForm</h1>
        <nav className="tabs">
          {TABS.map((id) => (
            <a key={id} href={`#/${id}`} className={active === id ? "active" : ""}>
              {t(`tab.${id}`)}
            </a>
          ))}
        </nav>
        <div className="controls">
          <select value={range} onChange={(e) => setRangePersist(Number(e.target.value))} aria-label={t("range.label")}>
            {[30, 90, 180, 365, 730].map((d) => (
              <option key={d} value={d}>
                {t("range.days", { n: d })}
              </option>
            ))}
          </select>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
          <SyncChip status={status} />
        </div>
      </header>

      {status && !status.configured && active !== "account" && (
        <div className="card" style={{ marginBottom: 12 }}>
          {t("banner.noKey")} <a href="#/account">{t("banner.addKey")}</a> {t("banner.toStart")}
        </div>
      )}

      {active === "overview" && <Overview {...props} />}
      {active === "recovery" && <Recovery {...props} />}
      {active === "training" && <Training {...props} />}
      {active === "activities" && <Activities {...props} selectedId={rest[0] ? Number(rest[0]) : null} />}
      {active === "insights" && <Insights {...props} />}
      {active === "data" && <Data {...props} />}
      {active === "account" && <Account me={me} onChange={reloadMe} />}
    </div>
  );
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function SyncChip({ status }: { status: Status | null }) {
  const { t, lang } = useI18n();
  if (!status) return null;
  const { sync } = status;
  const color = sync.running
    ? "var(--s1)"
    : sync.lastRun?.status === "ok"
      ? "var(--good)"
      : sync.lastRun?.status === "partial"
        ? "var(--warning)"
        : sync.lastRun
          ? "var(--critical)"
          : "var(--muted)";
  const text = sync.running
    ? t("sync.running", { step: sync.step })
    : sync.lastRun
      ? t("sync.done", {
          time: new Date(sync.lastRun.finished).toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" }),
          status: t(`sync.status.${sync.lastRun.status}` as Key),
        })
      : t("sync.never");
  return (
    <>
      <span className="chip">
        <span className="dot" style={{ background: color }} />
        {text}
      </span>
      <button className="btn" disabled={sync.running || !status.configured} onClick={() => api("sync", { method: "POST" })}>
        {t("sync.now")}
      </button>
    </>
  );
}

export interface PageProps {
  range: number;
  refreshKey: number;
  status: Status | null;
}
