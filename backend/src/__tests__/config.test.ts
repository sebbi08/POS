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

  it.each([
    ["too short", "123"],
    ["too long", "1234567"],
    ["not digits", "12a4"],
    ["surrounding whitespace", " 1234"],
    ["development default", "0000"],
  ])("production with ADMIN_PIN %s throws", (_label, pin) => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production", ADMIN_PIN: pin }),
    ).toThrow(/ADMIN_PIN/);
  });

  it.each(["4711", "123456"])("production with ADMIN_PIN %s is fine", (pin) => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production", ADMIN_PIN: pin }),
    ).not.toThrow();
  });

  it("development with ADMIN_PIN 0000 is fine", () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "development", ADMIN_PIN: "0000" }),
    ).not.toThrow();
  });
});
