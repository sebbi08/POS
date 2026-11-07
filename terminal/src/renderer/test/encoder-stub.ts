// Records the calls so tests can assert on what the encoder was asked to do.
export const calls: string[] = [];

export default class EncoderStub {
  constructor(_opts: unknown) {}
  initialize() { calls.push("initialize"); return this; }
  newline() { calls.push("newline"); return this; }
  line(text: string) { calls.push(`line:${text}`); return this; }
  align(a: string) { calls.push(`align:${a}`); return this; }
  bold(b: boolean) { calls.push(`bold:${b}`); return this; }
  text(text: string) { calls.push(`text:${text}`); return this; }
  cut() { calls.push("cut"); return this; }
  encode() { return new Uint8Array([0x1b, 0x40, 0x41]); }
}
