import type { CatalogSnapshot } from "../../shared/contract";
import type { LocalOrder, OrderLine } from "../domain/orders";

export type ReceiptLine =
  | { kind: "text"; text: string; align: "left" | "center" | "right"; bold?: boolean }
  | { kind: "rule" } | { kind: "blank" } | { kind: "cut" };

export interface PrintContext {
  company: CatalogSnapshot["company"];
  terminalName: string;
  width: 32 | 42;
  copy: boolean;
  /** Fallback timestamp for orders without closedAt (printable orders are always closed). */
  printedAt?: string;
}

export const formatAmount = (x: number): string => {
  const s = x.toFixed(2);
  return (s === "-0.00" ? "0.00" : s).replace(".", ",");
};

const text = (t: string, align: "left" | "center" | "right" = "left", bold?: boolean): ReceiptLine =>
  bold ? { kind: "text", text: t, align, bold } : { kind: "text", text: t, align };
const blank = (n: number): ReceiptLine[] => Array.from({ length: n }, () => ({ kind: "blank" }));

/** "left ... right" padded to the paper width. */
function twoColumns(left: string, right: string, width: number): string {
  return left + " ".repeat(Math.max(0, width - left.length - right.length)) + right;
}

function header(ctx: PrintContext): ReceiptLine[] {
  const { company } = ctx;
  const lines: ReceiptLine[] = [...blank(1)];
  if (company.name) {
    lines.push(text(company.name, "center", true));
    if (company.address) lines.push(text(company.address, "center"));
    if (company.city) lines.push(text(company.city, "center"));
    if (company.vatId) lines.push(text(`USt-ID: ${company.vatId}`, "center"));
  }
  lines.push(...blank(1), { kind: "rule" }, ...blank(2));
  return lines;
}

function footer(order: LocalOrder, ctx: PrintContext): ReceiptLine[] {
  const when = new Date(order.closedAt ?? ctx.printedAt ?? Date.now()).toLocaleString("de-DE");
  const lines: ReceiptLine[] = [
    text(`Bestellung #${order.id.slice(0, 8)} · ${ctx.terminalName}`, "center"),
    text(when, "center"),
  ];
  if (order.cancelsOrderId) lines.push(text(`Storno zu #${order.cancelsOrderId.slice(0, 8)}`, "center"));
  return lines;
}

function itemLines(line: OrderLine, width: number): ReceiptLine[] {
  const left = `${line.qty} x ${line.name}`;
  const right = `${formatAmount(line.total)} EUR`;
  if (left.length + right.length + 1 <= width) return [text(twoColumns(left, right, width))];
  return [text(left), text(right, "right")];
}

export function layoutFinalReceipt(order: LocalOrder, ctx: PrintContext): ReceiptLine[] {
  const { width } = ctx;
  const lines: ReceiptLine[] = [...header(ctx)];
  lines.push(text(order.cancelsOrderId ? "STORNO" : "Kassenbon", "center", true));
  if (ctx.copy) lines.push(text("*** KOPIE ***", "center"));
  lines.push(...blank(2));

  for (const l of order.lines) lines.push(...itemLines(l, width));
  lines.push(...blank(1), { kind: "rule" }, ...blank(2));

  const vat = Object.entries(order.totalVat);
  if (vat.length > 0) {
    for (const [rate, amount] of vat) {
      lines.push(text(twoColumns(`MwSt. ${rate} %:`, `${formatAmount(amount)} EUR`, width)));
    }
    lines.push(...blank(1), { kind: "rule" }, ...blank(2));
  }

  lines.push(text(`Summe: ${formatAmount(order.totalGross)} EUR`, "center", true));
  lines.push(...blank(4), ...footer(order, ctx), ...blank(5), { kind: "cut" });
  return lines;
}

export function layoutPickupReceipts(order: LocalOrder, ctx: PrintContext): ReceiptLine[][] {
  if (order.cancelsOrderId) return [];
  return order.lines.map((l, i) => [
    ...header(ctx),
    text(`Abholbon #${i + 1}`, "center", true),
    ...blank(2),
    text(`${l.qty} x ${l.name}`, "center"),
    ...blank(1), { kind: "rule" }, ...blank(2),
    ...footer(order, ctx),
    ...blank(4), { kind: "cut" },
  ]);
}

/** The final receipt, followed by one pickup receipt per line unless it is a cancellation. */
export function layoutJobs(order: LocalOrder, ctx: PrintContext, printPickups: boolean): ReceiptLine[][] {
  const jobs = [layoutFinalReceipt(order, ctx)];
  if (printPickups) jobs.push(...layoutPickupReceipts(order, ctx));
  return jobs;
}
