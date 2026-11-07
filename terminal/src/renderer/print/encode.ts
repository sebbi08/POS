import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";
import type { ReceiptLine } from "./layout";

// GS L: left margin in dots. Without it the first characters are cut off on 58/80mm printers.
const MARGIN_DOTS = 40;

/**
 * Inserts the margin command right after the ESC @ reset the encoder emits.
 * The library's own reset() clobbers it, so it is added after encoding. The library defers the
 * reset behind pending alignment padding, so ESC @ is searched for rather than assumed at index 0.
 */
export function wrapPrintData(data: Uint8Array): Uint8Array {
  let at = -1;
  for (let i = 0; i + 1 < data.length; i++) {
    if (data[i] === 0x1b && data[i + 1] === 0x40) { at = i; break; }
  }
  if (at < 0) return data;
  const marginCmd = [0x1d, 0x4c, MARGIN_DOTS & 0xff, (MARGIN_DOTS >> 8) & 0xff];
  const result = new Uint8Array(data.length + marginCmd.length);
  result.set(data.subarray(0, at + 2));
  result.set(marginCmd, at + 2);
  result.set(data.subarray(at + 2), at + 2 + marginCmd.length);
  return result;
}

export function encodeJob(lines: ReceiptLine[], width: 32 | 42): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({ language: "esc-pos", columns: width });
  encoder.initialize();
  for (const l of lines) {
    switch (l.kind) {
      case "text":
        encoder.align(l.align).bold(l.bold === true).text(l.text).bold(false).newline();
        break;
      case "rule":
        encoder.align("left").line("─".repeat(width));
        break;
      case "blank":
        encoder.newline();
        break;
      case "cut":
        encoder.align("left").cut();
        break;
    }
  }
  return wrapPrintData(encoder.encode());
}
