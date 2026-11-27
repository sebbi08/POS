import { useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "pos-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function resolveTheme(pref: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

function systemIsDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

/** Sets or removes the `dark` class on <html> and the matching `color-scheme`. */
export function applyTheme(pref: ThemePreference): void {
  const theme = resolveTheme(pref, systemIsDark());
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** Applies the preference and, while it is "system", follows changes of the OS scheme. */
export function useTheme(pref: ThemePreference): void {
  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system" || !window.matchMedia) return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);
}

/** The stored preference; missing, unknown or unreadable values count as "system". */
export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return PREFERENCES.find((p) => p === stored) ?? "system";
  } catch {
    return "system";
  }
}

// One shared preference for every component that reads or changes it.
let current: ThemePreference | null = null;
const subscribers = new Set<() => void>();

function getPreference(): ThemePreference {
  current ??= loadThemePreference();
  return current;
}

function setPreference(pref: ThemePreference): void {
  current = pref;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Not persisted (e.g. storage blocked): the choice still applies for this visit.
  }
  subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, getPreference);
  return [pref, setPreference];
}
