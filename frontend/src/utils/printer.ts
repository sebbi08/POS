const MARGIN_DOTS = 40;

function applyMargin(data: Uint8Array, marginDots: number): Uint8Array {
  const marginCmd = new Uint8Array([
    0x1d,
    0x4c,
    marginDots & 0xff,
    (marginDots >> 8) & 0xff,
  ]);
  if (data[0] === 0x1b && data[1] === 0x40) {
    const result = new Uint8Array(2 + marginCmd.length + data.length - 2);
    result.set(data.subarray(0, 2));
    result.set(marginCmd, 2);
    result.set(data.subarray(2), 2 + marginCmd.length);
    return result;
  }
  return data;
}

export function wrapPrintData(data: Uint8Array): Uint8Array {
  return applyMargin(data, MARGIN_DOTS);
}

export function getPrintWidth(paperWidth: string): number {
  return paperWidth === "58" ? 32 : 42;
}

export function getEncoderOptions(width: number) {
  return {
    language: "esc-pos",
    columns: width,
  };
}
