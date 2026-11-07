import { beforeEach, describe, expect, it } from "vitest";
import { calls } from "../test/encoder-stub";
import { encodeJob, wrapPrintData } from "./encode";

describe("encodeJob", () => {
  beforeEach(() => { calls.length = 0; });

  it("maps receipt lines to encoder calls", () => {
    encodeJob([
      { kind: "text", text: "Hallo", align: "center", bold: true },
      { kind: "rule" }, { kind: "blank" }, { kind: "cut" },
    ], 32);
    expect(calls).toEqual([
      "initialize", "align:center", "bold:true", "text:Hallo", "bold:false", "newline",
      "align:left", `line:${"─".repeat(32)}`, "newline", "align:left", "cut",
    ]);
  });

  it("inserts the left-margin command right after the reset", () => {
    const out = encodeJob([{ kind: "cut" }], 42);
    expect(Array.from(out)).toEqual([0x1b, 0x40, 0x1d, 0x4c, 40, 0, 0x41]);
  });

  it("leaves data without a leading reset untouched", () => {
    const raw = new Uint8Array([1, 2, 3]);
    expect(wrapPrintData(raw)).toBe(raw);
  });
});
