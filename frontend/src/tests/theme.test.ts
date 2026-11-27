import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  loadThemePreference,
  resolveTheme,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from "../lib/theme";
import { fakeMatchMedia } from "./fake-match-media";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  window.matchMedia = originalMatchMedia;
});

describe("theme", () => {
  it("resolveTheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("loadThemePreference falls back to system for missing or invalid values", () => {
    expect(loadThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "blau");
    expect(loadThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(loadThemePreference()).toBe("light");
  });

  it("loadThemePreference survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadThemePreference()).toBe("system");
  });

  it("applyTheme toggles the dark class and color-scheme", () => {
    fakeMatchMedia(false);
    applyTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    applyTheme("system");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("useTheme follows system changes only while on system", () => {
    const media = fakeMatchMedia(false);
    const { rerender } = renderHook(({ p }) => useTheme(p), {
      initialProps: { p: "system" as ThemePreference },
    });
    expect(document.documentElement).not.toHaveClass("dark");
    act(() => media.setSystemDark(true));
    expect(document.documentElement).toHaveClass("dark");

    rerender({ p: "light" });
    expect(document.documentElement).not.toHaveClass("dark");
    act(() => media.setSystemDark(false));
    act(() => media.setSystemDark(true));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(media.listenerCount()).toBe(0);
  });

  it("useThemePreference persists and shares the choice", () => {
    const a = renderHook(() => useThemePreference());
    const b = renderHook(() => useThemePreference());
    act(() => a.result.current[1]("dark"));
    expect(b.result.current[0]).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    act(() => a.result.current[1]("system"));
  });

  it("useThemePreference keeps working when localStorage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current[1]("light"));
    expect(result.current[0]).toBe("light");
    act(() => result.current[1]("system"));
  });
});
