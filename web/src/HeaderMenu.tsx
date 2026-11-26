import { IconDeviceDesktop, IconLogout, IconMoon, IconSun, IconUser } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { type Me, send } from "./api";
import { type Key, type Lang, useI18n } from "./i18n";
import { loadTheme, setTheme, THEMES, type ThemePref } from "./theme";

const THEME_ICON = { auto: IconDeviceDesktop, light: IconSun, dark: IconMoon };
/** Avatar backgrounds; white initials stay readable on each, in both themes. */
const AVATAR_COLORS = ["#2a78d6", "#d95926", "#13875d", "#b07400", "#7b5cd6", "#c2416b", "#3b7f8f"];

/** Up to two letters: the first of two name parts ("Ben Herfurth", "ben.herfurth"), else the first two. */
export function initials(name: string) {
  const parts = name.replace(/^ha\./, "").split(/[\s._@-]+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}

/** The same user always gets the same color, from their username. */
function avatarColor(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ me, size = 28 }: { me: Me; size?: number }) {
  const name = me.displayName ?? me.username;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(me.username) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/**
 * The signed-in user as an avatar; opens account, language, theme and sign out. Keeps settings
 * that rarely change out of the top bar.
 */
export function HeaderMenu({ me, active, onSignedOut }: { me: Me; active: boolean; onSignedOut: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemePref>(loadTheme);
  const box = useRef<HTMLDivElement>(null);
  const name = me.displayName ?? me.username;

  // Closes on a click or tap outside and on Escape, like a native menu.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", down);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("pointerdown", down);
      removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button
        type="button"
        className={active ? "avatar-btn active" : "avatar-btn"}
        aria-label={`${t("menu.label")}: ${name}`}
        title={name}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar me={me} />
      </button>
      {open && (
        <div className="menu-panel" role="group" aria-label={t("menu.label")}>
          <div className="menu-user">
            <Avatar me={me} size={36} />
            <div>
              <div className="name">{name}</div>
              <div className="muted">
                {me.displayName && me.displayName !== me.username ? me.username : ""}
                {me.mode === "homeassistant" && ` ${t("account.viaHa")}`}
              </div>
            </div>
          </div>
          <a className="menu-link" href="#/account" onClick={() => setOpen(false)}>
            <IconUser size={16} stroke={1.75} aria-hidden />
            {t("tab.account")}
          </a>
          <label>
            <span>{t("lang.label")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="menu-row">
            <span>{t("theme.label")}</span>
            <div className="seg" role="group" aria-label={t("theme.label")}>
              {THEMES.map((th) => {
                const Icon = THEME_ICON[th];
                const label = t(`theme.${th}` as Key);
                return (
                  <button
                    key={th}
                    type="button"
                    className="btn icon-btn"
                    aria-pressed={theme === th}
                    aria-label={label}
                    title={label}
                    onClick={() => {
                      setTheme(th);
                      setThemeState(th);
                    }}
                  >
                    <Icon size={16} stroke={1.75} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
          {/* Under Home Assistant everyone signs in through HA, so there is nothing to sign out of here. */}
          {me.mode === "local" && (
            <button type="button" className="menu-link" onClick={() => send("auth/logout", "POST").then(onSignedOut)}>
              <IconLogout size={16} stroke={1.75} aria-hidden />
              {t("account.signOut")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
