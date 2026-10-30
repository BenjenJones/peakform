// Per-browser view settings. Storage can be blocked (private mode), so every access is guarded.

export const TABS = ["overview", "day", "recovery", "training", "activities", "insights", "data", "account"] as const;
export type Tab = (typeof TABS)[number];

export function prefGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function prefSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

/** Tab shown when the app opens without a route. */
export const startTab = (): Tab => TABS.find((id) => id === prefGet("startTab")) ?? "overview";
