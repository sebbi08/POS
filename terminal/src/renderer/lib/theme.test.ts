import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ThemePreference } from "../../shared/types";
import { fakeMatchMedia } from "../test/fake-match-media";
import { applyTheme, normalizeTheme, resolveTheme, useTheme } from "./theme";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
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

  it("normalizeTheme treats missing or unknown values as system", () => {
    expect(normalizeTheme(undefined)).toBe("system");
    expect(normalizeTheme("blau")).toBe("system");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("light")).toBe("light");
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
});
