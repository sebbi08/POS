import { describe, expect, it } from "vitest";
import { assertProductionConfig } from "../config.js";

describe("assertProductionConfig", () => {
  it("production without ADMIN_PIN throws", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "production" })).toThrow(
      /ADMIN_PIN/,
    );
  });

  it("production with empty ADMIN_PIN throws", () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production", ADMIN_PIN: "" }),
    ).toThrow(/ADMIN_PIN/);
  });

  it("production with ADMIN_PIN is fine", () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production", ADMIN_PIN: "1234" }),
    ).not.toThrow();
  });

  it("development without ADMIN_PIN is fine", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
  });
});
