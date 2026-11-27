import { useEffect } from "react";
import type { ThemePreference } from "../../shared/types";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** The stored value as a preference; missing (older settings) or unknown values count as "system". */
export function normalizeTheme(value: unknown): ThemePreference {
  return PREFERENCES.find((p) => p === value) ?? "system";
}

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
