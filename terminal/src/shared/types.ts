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
export interface UsbDeviceChoice { deviceId: string; productName?: string; vendorId: number; productId: number }
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
  /** Why the local store is unusable (blocks the app), or null. */
  storeError(): Promise<string | null>;
  /** Main asks which USB device to pair (printer search); returns an unsubscribe. */
  onUsbChoose(cb: (devices: UsbDeviceChoice[]) => void): () => void;
  /** Answer to onUsbChoose; null cancels the search. */
  chooseUsb(deviceId: string | null): Promise<void>;
  /** An update is downloaded and installs on quit. Also fires for one that became ready before subscribing. */
  onUpdateReady(cb: (version: string) => void): () => void;
}
