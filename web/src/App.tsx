import { useEffect, useRef, useState } from "react";
import { api, type Me } from "./api";
import { detectLang, errorText, I18nProvider, type Key, type Lang, useI18n } from "./i18n";
import { Account } from "./pages/Account";
import { Activities } from "./pages/Activities";
import { Data } from "./pages/Data";
import { Day } from "./pages/Day";
import { Insights } from "./pages/Insights";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Recovery } from "./pages/Recovery";
import { Training } from "./pages/Training";
import { clearPrefs, loadPrefs, prefGet, prefSet, startTab, TABS } from "./prefs";

// Hash routing: no server-side route knowledge needed behind the ingress proxy.

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
  const { lang, setLang } = useI18n();
  const signedOut = () => {
    clearPrefs();
    setMe(null);
  };
  // Settings must be in place before the dashboard mounts: it reads start page and range once.
  const loadMe = () =>
    api<Me>("me").then((m) => {
      loadPrefs(m.prefs);
      const l = detectLang();
      if (l !== lang) setLang(l);
      setMe(m);
    }, signedOut);
  useEffect(() => {
    loadMe();
    const on = signedOut;
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
  const [range, setRange] = useState(() => Number(prefGet("range") ?? 90));
  const [status, setStatus] = useState<Status | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Read once: changing the setting must not navigate away from the open tab.
  const [home] = useState(startTab);
  const pollRef = useRef<() => Promise<void>>(async () => {});

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
    pollRef.current = poll;
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  const setRangePersist = (n: number) => {
    setRange(n);
    prefSet("range", String(n));
  };

  const { t, lang, setLang } = useI18n();
  const active = TABS.find((id) => id === tab) ?? home;
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
          <SyncChip status={status} refresh={() => pollRef.current()} />
        </div>
      </header>

      {status && !status.configured && active !== "account" && (
        <div className="card" style={{ marginBottom: 12 }}>
          {t("banner.noKey")} <a href="#/account">{t("banner.addKey")}</a> {t("banner.toStart")}
        </div>
      )}

      {active === "overview" && <Overview {...props} />}
      {active === "day" && <Day {...props} date={rest[0] ?? null} />}
      {active === "recovery" && <Recovery {...props} />}
      {active === "training" && <Training {...props} />}
      {active === "activities" && (
        <Activities {...props} selectedId={rest[0] ? Number(rest[0]) : null} compareId={rest[1] === "compare" && rest[2] ? Number(rest[2]) : null} />
      )}
      {active === "insights" && <Insights {...props} />}
      {active === "data" && <Data {...props} />}
      {active === "account" && <Account me={me} onChange={reloadMe} />}
    </div>
  );
}

function SyncChip({ status, refresh }: { status: Status | null; refresh: () => Promise<void> }) {
  const { t, lang } = useI18n();
  // Covers the gap between the click and the status poll that reports the running sync.
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (!status) return null;
  const { sync } = status;
  const busy = starting || sync.running;

  const start = async () => {
    setStarting(true);
    setFailed(null);
    try {
      await api("sync", { method: "POST" });
      await refresh();
    } catch (e) {
      setFailed(errorText(t, e));
    } finally {
      setStarting(false);
    }
  };

  const color = failed
    ? "var(--critical)"
    : busy
      ? "var(--s1)"
      : sync.lastRun?.status === "ok"
        ? "var(--good)"
        : sync.lastRun?.status === "partial"
          ? "var(--warning)"
          : sync.lastRun
            ? "var(--critical)"
            : "var(--muted)";
  const text = failed
    ? t("sync.failed", { error: failed })
    : sync.running
      ? t("sync.running", { step: sync.step })
      : starting
        ? t("sync.starting")
        : sync.lastRun
          ? t("sync.done", {
              time: new Date(sync.lastRun.finished).toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" }),
              status: t(`sync.status.${sync.lastRun.status}` as Key),
            })
          : t("sync.never");
  return (
    <>
      <span className="chip" role="status">
        <span className={busy ? "dot pulse" : "dot"} style={{ background: color }} />
        {text}
      </span>
      <button className="btn" disabled={busy || !status.configured} aria-busy={busy} onClick={start}>
        {busy && <span className="spinner" aria-hidden />}
        {busy ? t("sync.busy") : t("sync.now")}
      </button>
    </>
  );
}

export interface PageProps {
  range: number;
  refreshKey: number;
  status: Status | null;
}
