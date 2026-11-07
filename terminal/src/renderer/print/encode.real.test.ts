import { describe, expect, it } from "vitest";
import { encodeJob } from "./encode";
import { layoutFinalReceipt } from "./layout";
import type { LocalOrder } from "../domain/orders";

const MARGIN = [0x1d, 0x4c, 40, 0];

function indexOfBytes(data: Uint8Array, needle: number[]): number {
  for (let i = 0; i + needle.length <= data.length; i++) {
    if (needle.every((b, j) => data[i + j] === b)) return i;
  }
  return -1;
}

const order: LocalOrder = {
  id: "abcdef12-3456", terminalId: "t", status: "closed", discarded: false,
  lines: [{ itemId: "i", name: "Bier", qty: 1, unitPrice: 2.5, vatRate: 19, vatAmount: 0.4, total: 2.5 }],
  totalGross: 2.5, totalVat: { "19": 0.4 }, totalNet: 2.1,
  openedAt: "2026-11-07T10:00:00.000Z", closedAt: "2026-11-07T10:00:00.000Z", firstSeq: 1,
};

describe("encodeJob with the real encoder library", () => {
  it("a real receipt starts with ESC @ followed by the GS L margin and contains the text", () => {
    const lines = layoutFinalReceipt(order, {
      company: { name: "Verein", address: "", city: "", vatId: "" }, terminalName: "K1", width: 42, copy: false,
    });
    const out = encodeJob(lines, 42);
    expect(Array.from(out.subarray(0, 6))).toEqual([0x1b, 0x40, ...MARGIN]);
    expect(Buffer.from(out).includes(Buffer.from("Kassenbon"))).toBe(true);
  });

  it("still places the margin right after ESC @ when the first line is centered", () => {
    // The library emits the alignment padding before the reset in this case.
    const out = encodeJob([{ kind: "text", text: "Hi", align: "center" }], 42);
    const at = indexOfBytes(out, [0x1b, 0x40]);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(Array.from(out.subarray(at + 2, at + 6))).toEqual(MARGIN);
  });
});
