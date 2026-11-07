import type { BookingEventType, CatalogSnapshot } from "./contract";

export interface NewEvent { orderId: string; type: BookingEventType; data: Record<string, unknown>; occurredAt: string }
export interface LocalEvent extends NewEvent { seq: number }
export type CatalogItem = CatalogSnapshot["items"][number];
export type CatalogGroup = CatalogSnapshot["groups"][number];
export interface SavedPrinter { vendorId: number; productId: number; name: string }
export interface TerminalSettings {
  serverUrl: string; terminalId: string; terminalKey: string;
  changeCalculator: boolean; printer: SavedPrinter | null; paperWidth: "58" | "80";
  lastCatalogFetchAt: string | null; clockSkewMs: number | null;
}
export interface TerminalBridge {   // window.terminal
  appendEvents(events: NewEvent[]): Promise<LocalEvent[]>;
  readEvents(): Promise<LocalEvent[]>;
  markSynced(orderIds: string[]): Promise<void>;
  readSynced(): Promise<Record<string, string>>;     // orderId -> syncedAt ISO
  saveCatalog(c: CatalogSnapshot): Promise<void>;
  loadCatalog(): Promise<CatalogSnapshot | null>;
  saveSettings(s: TerminalSettings): Promise<void>;
  loadSettings(): Promise<TerminalSettings | null>;
  appVersion(): Promise<string>;
}
