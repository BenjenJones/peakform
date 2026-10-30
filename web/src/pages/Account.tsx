import { type FormEvent, useState } from "react";
import { type Me, send } from "../api";
import { errorText, fmtDate, useI18n } from "../i18n";
import { prefSet, startTab, type Tab, TABS } from "../prefs";

export function Account({ me, onChange }: { me: Me; onChange: () => void }) {
  return (
    <div className="grid">
      <GarminKey me={me} onChange={onChange} />
      <Prefs />
      {me.mode === "local" && <Password />}
      <Danger me={me} onChange={onChange} />
    </div>
  );
}

function GarminKey({ me, onChange }: { me: Me; onChange: () => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await send("me/garmin-key", "PUT", { apiKey: key });
      setKey("");
      setMsg({ ok: true, text: t("account.keySaved") });
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(t("account.keyRemoveConfirm"))) return;
    await send("me/garmin-key", "DELETE");
    onChange();
  };

  const k = me.garminKey;
  return (
    <form className="card span-6" onSubmit={save}>
      <h2>{t("account.keyTitle")}</h2>
      <p className="sub">{t("account.keySub")}</p>
      <p>
        {k ? (
          <>
            <span className="dot" style={{ background: k.last_error ? "var(--critical)" : "var(--good)" }} />{" "}
            {t("account.keyStored", { date: fmtDate(k.updated_at) })}
            {k.last_error && <div className="error">{t("account.keyRejected")}</div>}
          </>
        ) : (
          <>
            <span className="dot" style={{ background: "var(--muted)" }} /> {t("account.keyNone")}
          </>
        )}
      </p>
      <input
        className="input"
        type="password"
        autoComplete="off"
        placeholder={k ? t("account.keyPlaceholderReplace") : t("account.keyPlaceholderNew")}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      {msg && <div className={msg.ok ? "success" : "error"}>{msg.text}</div>}
      <div className="controls" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={busy || !key.trim()}>
          {busy ? t("account.keyChecking") : k ? t("account.keyReplace") : t("account.keySave")}
        </button>
        {k && (
          <button type="button" className="btn" onClick={remove}>
            {t("account.keyRemove")}
          </button>
        )}
      </div>
    </form>
  );
}

function Prefs() {
  const { t } = useI18n();
  const [start, setStart] = useState(startTab);
  const change = (v: Tab) => {
    setStart(v);
    prefSet("startTab", v);
  };
  return (
    <div className="card span-6">
      <h2>{t("account.prefsTitle")}</h2>
      <p className="sub">{t("account.prefsSub")}</p>
      <label className="controls">
        {t("account.startTab")}
        <select value={start} onChange={(e) => change(e.target.value as Tab)}>
          {TABS.map((id) => (
            <option key={id} value={id}>
              {t(`tab.${id}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Password() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await send("me/password", "POST", { current, next });
      // All sessions are revoked on password change; this reloads into the login screen.
      location.reload();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t, err) });
    }
  };

  return (
    <form className="card span-6" onSubmit={save}>
      <h2>{t("account.pwTitle")}</h2>
      <p className="sub">{t("account.pwSub")}</p>
      <input className="input" type="password" autoComplete="current-password" placeholder={t("account.pwCurrent")} value={current} onChange={(e) => setCurrent(e.target.value)} required />
      <input className="input" type="password" autoComplete="new-password" placeholder={t("account.pwNew")} minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
      {msg && <div className={msg.ok ? "success" : "error"}>{msg.text}</div>}
      <button className="btn primary" style={{ marginTop: 8 }}>
        {t("account.pwChange")}
      </button>
    </form>
  );
}

function Danger({ me, onChange }: { me: Me; onChange: () => void }) {
  const { t } = useI18n();
  const del = async () => {
    const answer = prompt(t("account.deleteConfirm", { name: me.username }));
    if (answer !== me.username) return;
    await send("me", "DELETE");
    onChange();
  };
  return (
    <div className="card span-6">
      <h2>{t("account.title")}</h2>
      <p className="sub">
        {t("account.signedInAs")} <b>{me.displayName ?? me.username}</b>
        {me.mode === "homeassistant" && ` ${t("account.viaHa")}`}
      </p>
      <div className="controls">
        {me.mode === "local" && (
          <button className="btn" onClick={() => send("auth/logout", "POST").then(onChange)}>
            {t("account.signOut")}
          </button>
        )}
        <button className="btn danger" onClick={del}>
          {t("account.delete")}
        </button>
      </div>
    </div>
  );
}
