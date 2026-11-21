import { type FormEvent, useState } from "react";
import { send, useApi } from "../api";
import { errorText, type Lang, useI18n } from "../i18n";
import logo from "../logo.svg";

type Mode = "login" | "register" | "forgot" | "reset";

/** Token from a reset link (#/reset/<token>), if the page was opened from one. */
const resetToken = () => location.hash.match(/^#\/reset\/([\w-]+)$/)?.[1] ?? null;

export function Login({ onDone }: { onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { data: cfg } = useApi<{ mode: string; registration: boolean; passwordReset: boolean }>("auth/config");
  const [token] = useState(resetToken);
  const [mode, setMode] = useState<Mode>(token ? "reset" : "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (cfg?.mode === "homeassistant") {
    return (
      <div className="auth card">
        <h2>{t("login.haTitle")}</h2>
        <p className="sub">{t("login.haText")}</p>
      </div>
    );
  }

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(false);
    setPassword("");
    setPassword2("");
    if (m !== "reset" && location.hash.startsWith("#/reset/")) history.replaceState(null, "", location.pathname + location.search);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if ((mode === "register" || mode === "reset") && password !== password2) return setError(t("login.mismatch"));
    setBusy(true);
    try {
      if (mode === "forgot") {
        await send("auth/forgot", "POST", { identifier: username, lang });
        setSent(true);
        return;
      }
      if (mode === "reset") await send("auth/reset", "POST", { token, password });
      else await send(`auth/${mode}`, "POST", mode === "register" ? { username, password, email } : { username, password });
      // Leave the reset link, so a reload does not show the form again.
      if (mode === "reset") history.replaceState(null, "", location.pathname + location.search);
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const title = { login: t("login.signIn"), register: t("login.create"), forgot: t("login.forgotTitle"), reset: t("login.resetTitle") }[mode];
  const button = { login: t("login.signIn"), register: t("login.create"), forgot: t("login.forgotSend"), reset: t("login.resetSave") }[mode];
  const newPassword = mode === "register" || mode === "reset";

  return (
    <form className="auth card" onSubmit={submit}>
      <img src={logo} alt="" width={40} height={40} style={{ borderRadius: 9 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 18 }}>{title}</h2>
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
          <option value="de">DE</option>
          <option value="en">EN</option>
        </select>
      </div>
      <p className="sub">{mode === "forgot" ? t("login.forgotText") : mode === "reset" ? t("login.resetText") : "PeakForm for Garmin"}</p>

      {sent ? (
        <div className="success">{t("login.forgotSent")}</div>
      ) : (
        <>
          {mode !== "reset" && (
            <label>
              {mode === "forgot" ? t("login.usernameOrEmail") : t("login.username")}
              <input className="input" autoComplete={mode === "forgot" ? "email" : "username"} value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
          )}
          {mode === "register" && cfg?.passwordReset && (
            <label>
              {t("login.email")}
              <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              {mode === "reset" ? t("login.newPassword") : t("login.password")}
              <input
                className="input"
                type="password"
                autoComplete={newPassword ? "new-password" : "current-password"}
                minLength={newPassword ? 10 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          {newPassword && (
            <label>
              {t("login.repeat")}
              <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {button}
          </button>
        </>
      )}

      {mode === "login" && cfg?.passwordReset && (
        <button type="button" className="link" onClick={() => go("forgot")}>
          {t("login.forgot")}
        </button>
      )}
      {mode === "login" && cfg?.registration && (
        <button type="button" className="link" onClick={() => go("register")}>
          {t("login.toRegister")}
        </button>
      )}
      {mode !== "login" && (
        <button type="button" className="link" onClick={() => go("login")}>
          {mode === "register" ? t("login.toLogin") : t("login.backToLogin")}
        </button>
      )}
    </form>
  );
}
