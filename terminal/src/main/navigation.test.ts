import { describe, expect, it } from "vitest";
import { isAllowedNavigation } from "./navigation";

describe("isAllowedNavigation", () => {
  it("allows the packaged renderer (file://)", () => {
    expect(isAllowedNavigation("file:///opt/POS%20Kasse/resources/app.asar/out/renderer/index.html", undefined)).toBe(true);
  });

  it("allows the dev server's own origin only", () => {
    const dev = "http://localhost:5173/";
    expect(isAllowedNavigation("http://localhost:5173/index.html#x", dev)).toBe(true);
    expect(isAllowedNavigation("http://localhost:5174/", dev)).toBe(false);
    expect(isAllowedNavigation("https://localhost:5173/", dev)).toBe(false);
  });

  it("blocks foreign pages, also when no dev server is configured", () => {
    expect(isAllowedNavigation("https://example.com/", "http://localhost:5173/")).toBe(false);
    expect(isAllowedNavigation("http://localhost:5173/", undefined)).toBe(false);
    expect(isAllowedNavigation("javascript:alert(1)", undefined)).toBe(false);
  });

  it("blocks malformed URLs", () => {
    expect(isAllowedNavigation("not a url", "also not a url")).toBe(false);
  });
});
