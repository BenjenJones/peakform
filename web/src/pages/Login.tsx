import { type FormEvent, useState } from "react";
import { send, useApi } from "../api";
import { errorText, type Lang, useI18n } from "../i18n";

export function Login({ onDone }: { onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { data: cfg } = useApi<{ mode: string; registration: boolean }>("auth/config");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (cfg?.mode === "homeassistant") {
    return (
      <div className="auth card">
        <h2>{t("login.haTitle")}</h2>
        <p className="sub">{t("login.haText")}</p>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "register" && password !== password2) return setError(t("login.mismatch"));
    setBusy(true);
    try {
      await send(`auth/${mode}`, "POST", { username, password });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth card" onSubmit={submit}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 18 }}>{mode === "login" ? t("login.signIn") : t("login.create")}</h2>
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
          <option value="de">DE</option>
          <option value="en">EN</option>
        </select>
      </div>
      <p className="sub">PeakForm for Garmin</p>
      <label>
        {t("login.username")}
        <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label>
        {t("login.password")}
        <input
          className="input"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 10 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {mode === "register" && (
        <label>
          {t("login.repeat")}
          <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
        </label>
      )}
      {error && <div className="error">{error}</div>}
      <button className="btn primary" disabled={busy}>
        {mode === "login" ? t("login.signIn") : t("login.create")}
      </button>
      {cfg?.registration && (
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? t("login.toRegister") : t("login.toLogin")}
        </button>
      )}
    </form>
  );
}
