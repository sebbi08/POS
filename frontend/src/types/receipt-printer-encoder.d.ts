declare module "@point-of-sale/receipt-printer-encoder" {
  export default class ReceiptPrinterEncoder {
    constructor(options?: {
      language?: string;
      columns?: number;
      imageMode?: string;
      feedBeforeCut?: number;
      newline?: string;
      codepageMapping?: string;
      codepageCandidates?: string[] | null;
      errors?: string;
    });
    initialize(): this;
    newline(count?: number): this;
    text(text: string): this;
    line(text: string): this;
    bold(value: boolean): this;
    align(value: "left" | "center" | "right"): this;
    cut(type?: "full" | "partial"): this;
    encode(): Uint8Array;
  }
}
