import { send } from "./api";

// View settings. Stored with the account so they follow the user across browsers; localStorage
// keeps a copy for the login screen, before the account is known. Storage can be blocked
// (private mode), so every access is guarded.

const KEYS = ["startTab", "range", "lang"] as const;

/** Server copy while signed in; null on the login screen, where nothing can be saved. */
let account: Record<string, string> | null = null;

function localGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function localSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

/** Takes the account's settings after sign-in; settings only this browser had are uploaded once. */
export function loadPrefs(prefs: Record<string, string>) {
  account = { ...prefs };
  const missing: Record<string, string> = {};
  for (const k of KEYS) {
    const local = localGet(k);
    if (account[k] !== undefined) localSet(k, account[k]);
    else if (local !== null) missing[k] = account[k] = local;
  }
  if (Object.keys(missing).length) send("me/prefs", "PUT", missing).catch(() => {});
}

export const clearPrefs = () => {
  account = null;
};

export const TABS = ["overview", "day", "recovery", "training", "activities", "insights", "data", "account"] as const;
export type Tab = (typeof TABS)[number];

export const prefGet = (k: (typeof KEYS)[number]) => account?.[k] ?? localGet(k);

export function prefSet(k: (typeof KEYS)[number], v: string) {
  localSet(k, v);
  if (!account || account[k] === v) return;
  account[k] = v;
  send("me/prefs", "PUT", { [k]: v }).catch(() => {});
}

/** Tab shown when the app opens without a route. */
export const startTab = (): Tab => TABS.find((id) => id === prefGet("startTab")) ?? "overview";
