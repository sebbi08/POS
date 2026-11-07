import type { CatalogSnapshot } from "../../shared/contract";
import type { TerminalSettings } from "../../shared/types";
import type { LocalOrder } from "../domain/orders";
import { encodeJob } from "../print/encode";
import { layoutJobs } from "../print/layout";
import { PrintError } from "../print/usb";

/** Final receipt (plus pickup receipts if the terminal prints them), encoded for the paper width. */
export function receiptJobs(order: LocalOrder, catalog: CatalogSnapshot, settings: TerminalSettings, copy: boolean): Uint8Array[] {
  const width = settings.paperWidth === "58" ? 32 : 42;
  const ctx = { company: catalog.company, terminalName: catalog.terminal.name, width, copy } as const;
  return layoutJobs(order, ctx, catalog.terminal.printPickupReceipts).map((lines) => encodeJob(lines, width));
}

export function printFailureText(err: unknown): string {
  const reason = err instanceof PrintError
    ? err.message
    : `Drucken fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
  return `${reason} – Buchung ist gespeichert. „Letzten Bon nachdrucken“ verwenden.`;
}
