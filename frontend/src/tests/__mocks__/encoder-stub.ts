export default class EncoderStub {
  constructor(_opts: any) {}
  initialize() { return this; }
  newline() { return this; }
  line(_text: string) { return this; }
  align(_a: string) { return this; }
  bold(_b: boolean) { return this; }
  text(_text: string) { return this; }
  cut() { return this; }
  encode() { return new Uint8Array(); }
}
