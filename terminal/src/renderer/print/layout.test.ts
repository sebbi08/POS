import { describe, expect, it } from "vitest";
import type { LocalOrder } from "../domain/orders";
import {
  formatAmount, layoutFinalReceipt, layoutJobs, layoutPickupReceipts,
  type PrintContext, type ReceiptLine,
} from "./layout";

const ctx: PrintContext = {
  company: { name: "Verein e.V.", address: "Hauptstr. 1", city: "12345 Stadt", vatId: "DE123" },
  terminalName: "Kasse 1", width: 42, copy: false,
};

const CLOSED_AT = "2026-11-07T10:00:00.000Z";

const order: LocalOrder = {
  id: "abcdef12-3456-7890", terminalId: "t1", status: "closed", discarded: false,
  lines: [
    { itemId: "i1", name: "Bier", qty: 3, unitPrice: 2.5, vatRate: 19, vatAmount: 1.2, total: 7.5 },
    { itemId: "i2", name: "Wasser", qty: 1, unitPrice: 2, vatRate: 19, vatAmount: 0.32, total: 2 },
  ],
  totalGross: 9.5, totalVat: { "19": 1.52 }, totalNet: 7.98,
  openedAt: CLOSED_AT, closedAt: CLOSED_AT, firstSeq: 1,
};

const oneLine: LocalOrder = {
  ...order, lines: [order.lines[0]], totalGross: 7.5, totalVat: { "19": 1.2 }, totalNet: 6.3,
};

const cancel: LocalOrder = {
  ...order, id: "99999999-aaaa", cancelsOrderId: "abcdef12-3456-7890",
  lines: order.lines.map((l) => ({ ...l, total: -l.total, vatAmount: -l.vatAmount })),
  totalGross: -9.5, totalVat: { "19": -1.52 }, totalNet: -7.98,
};

const texts = (lines: ReceiptLine[]) =>
  lines.flatMap((l) => (l.kind === "text" ? [l.text] : []));
const all = (lines: ReceiptLine[]) => texts(lines).join("\n");

describe("receipt layout", () => {
  it("formatAmount uses comma decimals", () => {
    expect(formatAmount(7.5)).toBe("7,50");
    expect(formatAmount(-1.2)).toBe("-1,20");
  });

  it("final receipt contains German totals with comma decimals", () => {
    const text = all(layoutFinalReceipt(oneLine, ctx));
    expect(text).toContain("Kassenbon");
    expect(text).toContain("3 x Bier");
    expect(text).toContain("7,50 EUR");
    expect(text).toContain("MwSt. 19 %:");
    expect(text).toContain("1,20 EUR");
    expect(text).toContain("Summe: 7,50 EUR");
  });

  it("header, footer and alignment follow the spec", () => {
    const lines = layoutFinalReceipt(oneLine, ctx);
    const text = all(lines);
    expect(text).toContain("USt-ID: DE123");
    expect(text).toContain("Bestellung #abcdef12 · Kasse 1");
    expect(text).toContain(new Date(CLOSED_AT).toLocaleString("de-DE"));
    expect(lines).toContainEqual({ kind: "text", text: "Verein e.V.", align: "center", bold: true });
    expect(lines).toContainEqual({ kind: "text", text: "Summe: 7,50 EUR", align: "center", bold: true });
    expect(lines.at(-1)).toEqual({ kind: "cut" });
  });

  it("item line fills the paper width with the amount right-aligned", () => {
    const item = texts(layoutFinalReceipt(oneLine, ctx)).find((t) => t.includes("3 x Bier"))!;
    expect(item.length).toBe(42);
    expect(item.endsWith("7,50 EUR")).toBe(true);
  });

  it("long item names fall back to two lines", () => {
    const long = { ...oneLine, lines: [{ ...oneLine.lines[0], name: "Sehr langer Artikelname mit Beilage" }] };
    const lines = layoutFinalReceipt(long, { ...ctx, width: 32 });
    expect(lines).toContainEqual({ kind: "text", text: "3 x Sehr langer Artikelname mit Beilage", align: "left" });
    expect(lines).toContainEqual({ kind: "text", text: "7,50 EUR", align: "right" });
  });

  it("copy flag adds KOPIE line", () => {
    expect(all(layoutFinalReceipt(oneLine, ctx))).not.toContain("KOPIE");
    expect(all(layoutFinalReceipt(oneLine, { ...ctx, copy: true }))).toContain("*** KOPIE ***");
  });

  it("cancellation prints STORNO and no pickup jobs", () => {
    const text = all(layoutFinalReceipt(cancel, ctx));
    expect(text).toContain("STORNO");
    expect(text).not.toContain("Kassenbon");
    expect(text).toContain("Storno zu #abcdef12");
    expect(text).toContain("-9,50 EUR");
    expect(layoutPickupReceipts(cancel, ctx)).toEqual([]);
    expect(layoutJobs(cancel, ctx, true).length).toBe(1);
  });

  it("pickup jobs only when enabled", () => {
    expect(layoutJobs(order, ctx, true).length).toBe(3);
    expect(layoutJobs(order, ctx, false).length).toBe(1);
  });

  it("pickup receipt has numbered title, centered line and footer", () => {
    const [first, second] = layoutPickupReceipts(order, ctx);
    expect(all(first)).toContain("Abholbon #1");
    expect(all(second)).toContain("Abholbon #2");
    expect(first).toContainEqual({ kind: "text", text: "3 x Bier", align: "center" });
    expect(all(first)).toContain("Bestellung #abcdef12 · Kasse 1");
    expect(first.at(-1)).toEqual({ kind: "cut" });
  });

  it("omits header lines the company does not have", () => {
    const text = all(layoutFinalReceipt(oneLine, { ...ctx, company: { name: "", address: "", city: "", vatId: "" } }));
    expect(text).not.toContain("USt-ID");
  });
});
