import { describe, it, expect } from "vitest";
import {
  addDays,
  isoToDate,
  dateToIso,
  groupFestivals,
  formatRangeLabel,
  formatFestivalLabel,
  formatCount,
  type BookingDay,
} from "@/lib/booking-days";

const d = (day: string, orderCount = 1): BookingDay => ({ day, orderCount });

describe("addDays / isoToDate / dateToIso", () => {
  it("adds days across DST and month boundaries", () => {
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("round-trips through local dates", () => {
    expect(dateToIso(isoToDate("2026-07-10"))).toBe("2026-07-10");
  });
});

describe("groupFestivals", () => {
  it("groups consecutive days, newest first", () => {
    const r = groupFestivals([
      d("2026-07-10", 2),
      d("2026-07-11", 3),
      d("2026-07-12", 4),
      d("2026-07-14", 5),
    ]);
    expect(r).toEqual([
      { from: "2026-07-14", to: "2026-07-14", orderCount: 5 },
      { from: "2026-07-10", to: "2026-07-12", orderCount: 9 },
    ]);
  });
  it("limits to the newest 5", () => {
    const days = [1, 3, 5, 7, 9, 11, 13].map((n) => d(`2026-07-${String(n).padStart(2, "0")}`));
    const r = groupFestivals(days);
    expect(r).toHaveLength(5);
    expect(r[0].from).toBe("2026-07-13");
    expect(r[4].from).toBe("2026-07-05");
  });
  it("returns [] for empty input", () => {
    expect(groupFestivals([])).toEqual([]);
  });
  it("accepts unsorted input", () => {
    const sorted = [d("2026-07-10", 2), d("2026-07-11", 3), d("2026-07-14", 5)];
    const shuffled = [sorted[2], sorted[0], sorted[1]];
    expect(groupFestivals(shuffled)).toEqual(groupFestivals(sorted));
  });
  it.each([
    [["2026-10-24", "2026-10-25", "2026-10-26"]],
    [["2026-03-28", "2026-03-29", "2026-03-30"]],
    [["2026-07-31", "2026-08-01"]],
    [["2025-12-31", "2026-01-01"]],
  ])("treats %j as one festival", (days) => {
    const r = groupFestivals(days.map((x) => d(x)));
    expect(r).toHaveLength(1);
    expect(r[0].from).toBe(days[0]);
    expect(r[0].to).toBe(days[days.length - 1]);
  });
});

describe("labels", () => {
  it("formatRangeLabel", () => {
    expect(formatRangeLabel("2026-07-12", "2026-07-12")).toBe("12.07.2026");
    expect(formatRangeLabel("2026-07-10", "2026-07-12")).toBe("10.07. – 12.07.2026");
    expect(formatRangeLabel("2025-12-28", "2026-01-02")).toBe("28.12.2025 – 02.01.2026");
  });
  it("formatFestivalLabel", () => {
    const f = (from: string, to: string) => ({ from, to, orderCount: 1 });
    expect(formatFestivalLabel(f("2026-05-01", "2026-05-01"))).toBe("1. Mai 2026");
    expect(formatFestivalLabel(f("2026-07-10", "2026-07-12"))).toBe("10.–12. Juli 2026");
    expect(formatFestivalLabel(f("2026-07-31", "2026-08-01"))).toBe("31. Juli – 1. August 2026");
    expect(formatFestivalLabel(f("2025-12-31", "2026-01-01"))).toBe(
      "31. Dezember 2025 – 1. Januar 2026",
    );
  });
  it("formatCount", () => {
    expect(formatCount(1)).toBe("1 Buchung");
    expect(formatCount(1044)).toBe("1.044 Buchungen");
  });
});
