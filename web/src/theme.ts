import { prefGet, prefSet } from "./prefs";

/**
 * Color theme. The dark tokens in styles.css apply to `:root[data-theme="dark"]`, so the
 * attribute always holds the resolved theme; "auto" follows the system setting live.
 * index.html sets it once before the first paint, from the same localStorage key.
 */
export type ThemePref = "auto" | "light" | "dark";
export const THEMES: ThemePref[] = ["auto", "light", "dark"];

const system = matchMedia("(prefers-color-scheme: dark)");
let current: ThemePref = "auto";

const parse = (v: string | null): ThemePref => (v === "light" || v === "dark" ? v : "auto");

function apply() {
  const dark = current === "dark" || (current === "auto" && system.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
system.addEventListener("change", () => current === "auto" && apply());

/** Takes the stored setting, e.g. after sign-in when the account's copy arrives. */
export function loadTheme(): ThemePref {
  current = parse(prefGet("theme"));
  apply();
  return current;
}

export function setTheme(t: ThemePref) {
  current = t;
  prefSet("theme", t);
  apply();
}

loadTheme();
