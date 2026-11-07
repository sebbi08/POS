import { describe, it, expect, vi, afterEach } from "vitest";
import { todayIso } from "../lib/format";

describe("todayIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Europe/Berlin calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T22:30:00Z"));
    expect(todayIso()).toBe("2026-06-02");
  });

  it("uses the Europe/Berlin calendar day in winter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T23:30:00Z"));
    expect(todayIso()).toBe("2026-01-11");
  });
});
