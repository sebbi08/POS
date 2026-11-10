import { describe, expect, it } from "vitest";
import { applyKey, type KeypadKey } from "./keypad-entry";

/** Presses the keys one after another, starting from an empty value. */
function press(mode: "pin" | "amount", ...keys: KeypadKey[]): string {
  return keys.reduce((value, key) => applyKey(value, key, mode), "");
}

describe("applyKey – amount", () => {
  it.each<[KeypadKey[], string]>([
    [["1", "0"], "10"],
    [["1", "0", ",", "5"], "10,5"],
    [["1", ",", "2", "5"], "1,25"],
    [[",", "5"], "0,5"],
    [["1", ",", ",", "5"], "1,5"], // second comma ignored
    [["1", ",", "2", "5", "9"], "1,25"], // no third decimal
    [["0", "5"], "5"], // no leading zero
    [["0", ",", "5"], "0,5"],
    [["1", "2", "3", "4", "5", "6"], "12345"], // at most 5 euro digits
    [["1", "2", "back"], "1"],
    [["1", ",", "back"], "1"],
    [["back"], ""],
    [["1", "2", "clear"], ""],
  ])("%j → %s", (keys, want) => {
    expect(press("amount", ...keys)).toBe(want);
  });

  it("allows decimals once the euro part is full", () => {
    expect(press("amount", "1", "2", "3", "4", "5", ",", "9", "9")).toBe("12345,99");
  });
});

describe("applyKey – pin", () => {
  it.each<[KeypadKey[], string]>([
    [["0", "0", "0", "0"], "0000"], // leading zeros are part of a PIN
    [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2"], "123456789012"],
    [["1", ","], "1"], // no comma in a PIN
    [["1", "2", "back"], "1"],
    [["1", "2", "clear"], ""],
  ])("%j → %s", (keys, want) => {
    expect(press("pin", ...keys)).toBe(want);
  });
});
