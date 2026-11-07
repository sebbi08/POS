import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDataDir } from "./data-dir";

describe("resolveDataDir", () => {
  it("defaults to <userData>/data", () => {
    expect(resolveDataDir(undefined, "/home/kasse/.config/POS Kasse")).toBe(
      join("/home/kasse/.config/POS Kasse", "data"),
    );
  });

  it("resolves POS_TERMINAL_DATA_DIR to an absolute path", () => {
    expect(resolveDataDir("relative/kasse", "/ignored")).toBe(resolve("relative/kasse"));
  });

  it("rejects an empty POS_TERMINAL_DATA_DIR", () => {
    expect(() => resolveDataDir("", "/ignored")).toThrow(/POS_TERMINAL_DATA_DIR/);
    expect(() => resolveDataDir("   ", "/ignored")).toThrow(/POS_TERMINAL_DATA_DIR/);
  });
});
