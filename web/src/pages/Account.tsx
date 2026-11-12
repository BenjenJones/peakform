import { type FormEvent, useEffect, useState } from "react";
import { type HrLimits as HrLimitsData, type Me, type ReviewModel, type ReviewSettings, send, useApi } from "../api";
import { errorText, fmtDate, useI18n } from "../i18n";
import { prefSet, startTab, type Tab, TABS } from "../prefs";

export function Account({ me, onChange }: { me: Me; onChange: () => void }) {
  return (
    <div className="grid">
      <GarminKey me={me} onChange={onChange} />
      <ReviewSetup />
      <Prefs />
      <HrLimits />
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

/** Anthropic API key, the athlete data Garmin does not share (sex, birth date) and the extra prompt. */
function ReviewSetup() {
  const { t } = useI18n();
  const [reload, setReload] = useState(0);
  const { data } = useApi<ReviewSettings>("me/review-settings", [reload]);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [sex, setSex] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [goals, setGoals] = useState("");
  const [model, setModel] = useState<ReviewModel>("opus");
  const [tokenMsg, setTokenMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!data) return;
    setSex(data.profile.sex ?? "");
    setBirthDate(data.profile.birthDate ?? "");
    setGoals(data.profile.goals);
    setModel(data.profile.model);
  }, [data]);
  if (!data) return null;

  const saveToken = async (e: FormEvent) => {
    e.preventDefault();
    setTokenMsg(null);
    setBusy(true);
    try {
      await send("me/anthropic-key", "PUT", { apiKey: token });
      setToken("");
      setTokenMsg({ ok: true, text: t("review.tokenSaved") });
      setReload((n) => n + 1);
    } catch (err) {
      setTokenMsg({ ok: false, text: errorText(t, err) });
    } finally {
      setBusy(false);
    }
  };
  const removeToken = async () => {
    if (!confirm(t("review.tokenRemoveConfirm"))) return;
    await send("me/anthropic-key", "DELETE");
    setReload((n) => n + 1);
  };
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await send("me/review-settings", "PUT", { sex: sex || null, birthDate: birthDate || null, goals, model });
      setMsg({ ok: true, text: t("review.profileSaved") });
    } catch (err) {
      setMsg({ ok: false, text: errorText(t, err) });
    }
  };

  return (
    <div className="card">
      <h2>{t("review.setupTitle")}</h2>
      <p className="sub">{t("review.setupSub", { date: fmtDate(data.since) })}</p>
      <div className="grid">
        <form className="span-6" onSubmit={saveToken}>
          <h2>{t("review.tokenTitle")}</h2>
          <p className="sub">
            {t("review.tokenHelp")}{" "}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
              platform.claude.com
            </a>
          </p>
          <p>
            <span className="dot" style={{ background: data.apiKey ? "var(--good)" : "var(--muted)" }} />{" "}
            {data.apiKey ? t("review.tokenStored", { date: fmtDate(data.apiKey.updatedAt) }) : t("review.tokenNone")}
          </p>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder={data.apiKey ? t("review.tokenPlaceholderReplace") : t("review.tokenPlaceholderNew")}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {tokenMsg && <div className={tokenMsg.ok ? "success" : "error"}>{tokenMsg.text}</div>}
          <div className="controls" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={busy || !token.trim()}>
              {busy ? t("review.tokenChecking") : data.apiKey ? t("account.keyReplace") : t("review.tokenSave")}
            </button>
            {data.apiKey && (
              <button type="button" className="btn" onClick={removeToken}>
                {t("account.keyRemove")}
              </button>
            )}
          </div>
        </form>
        <form className="span-6" onSubmit={saveProfile}>
          <h2>{t("review.profileTitle")}</h2>
          <p className="sub">{t("review.profileSub")}</p>
          <div className="controls" style={{ marginBottom: 6 }}>
            <label className="controls">
              {t("review.sex")}
              <select value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">–</option>
                <option value="female">{t("review.female")}</option>
                <option value="male">{t("review.male")}</option>
              </select>
            </label>
            <label className="controls">
              {t("review.birthDate")}
              <input className="input" style={{ width: "auto", margin: 0 }} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </label>
            <label className="controls">
              {t("review.model")}
              <select value={model} onChange={(e) => setModel(e.target.value as ReviewModel)}>
                {data.models.map((m) => (
                  <option key={m} value={m}>
                    {t(`review.model.${m}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label htmlFor="review-goals" className="sub" style={{ display: "block" }}>
            {t("review.goals")}
          </label>
          <textarea
            id="review-goals"
            className="input"
            rows={5}
            maxLength={data.maxGoals}
            placeholder={t("review.goalsPlaceholder")}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
          />
          {msg && <div className={msg.ok ? "success" : "error"}>{msg.text}</div>}
          <button className="btn primary" style={{ marginTop: 8 }}>
            {t("review.profileSave")}
          </button>
        </form>
      </div>
    </div>
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

/** Upper heart rate limit per sport, drawn into the heart rate charts. Stored on the server. */
function HrLimits() {
  const { t, sport } = useI18n();
  const { data } = useApi<HrLimitsData>("me/hr-limits");
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (data) setValues(Object.fromEntries(Object.entries(data.limits).map(([k, v]) => [k, String(v)])));
  }, [data]);
  if (!data?.types.length) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const limits = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, Number(v)]));
    try {
      await send("me/hr-limits", "PUT", { limits });
      setMsg({ ok: true, text: t("account.hrLimitsSaved") });
    } catch (err) {
      setMsg({ ok: false, text: errorText(t, err) });
    }
  };

  return (
    <form className="card span-6" onSubmit={save}>
      <h2>{t("account.hrLimitsTitle")}</h2>
      <p className="sub">{t("account.hrLimitsSub")}</p>
      <table>
        <tbody>
          {data.types.map((type) => (
            <tr key={type}>
              <td>{sport(type)}</td>
              <td className="num" style={{ width: 120 }}>
                <input
                  className="input"
                  style={{ margin: 0, textAlign: "right" }}
                  type="number"
                  inputMode="numeric"
                  min={60}
                  max={240}
                  step={1}
                  placeholder="–"
                  aria-label={`${sport(type)} (bpm)`}
                  value={values[type] ?? ""}
                  onChange={(e) => setValues({ ...values, [type]: e.target.value })}
                />
              </td>
              <td className="muted" style={{ width: 40 }}>bpm</td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <div className={msg.ok ? "success" : "error"}>{msg.text}</div>}
      <button className="btn primary" style={{ marginTop: 8 }}>
        {t("account.hrLimitsSave")}
      </button>
    </form>
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
