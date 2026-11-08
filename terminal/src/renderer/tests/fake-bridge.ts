import { vi } from "vitest";
import type { CatalogSnapshot } from "../../shared/contract";
import type { LocalEvent, NewEvent, TerminalBridge, TerminalSettings } from "../../shared/types";

export const T0 = "2026-11-07T10:00:00.000Z";

export const catalog: CatalogSnapshot = {
  serverTime: T0,
  terminal: { id: "t1", name: "Theke 1", printPickupReceipts: true },
  company: { name: "Musikverein", address: "Hauptstr. 1", city: "12345 Dorf", vatId: "DE123" },
  groups: [
    { id: "g1", name: "Getränke", vatRate: 19 },
    { id: "g2", name: "Essen", vatRate: 7 },
  ],
  items: [
    { id: "i1", name: "Bier", groupId: "g1", price: 3.75 },
    { id: "i2", name: "Bratwurst", groupId: "g2", price: 4.5 },
  ],
};

export const settings: TerminalSettings = {
  serverUrl: "https://kasse.example", terminalId: "t1", terminalKey: "key-1",
  changeCalculator: false, printer: { vendorId: 1, productId: 2, name: "TM-T20" }, paperWidth: "80",
  lastCatalogFetchAt: T0, clockSkewMs: 0,
};

/** Events of a closed sale: 2 x Bier = 7,50 €. */
export function saleEvents(id: string): NewEvent[] {
  return [
    { orderId: id, type: "OrderOpened", data: { id, terminalId: "t1" }, occurredAt: T0 },
    {
      orderId: id, type: "ItemAdded", occurredAt: T0,
      data: { orderId: id, itemId: "i1", name: "Bier", qty: 2, unitPrice: 3.75, vatRate: 19, vatAmount: 1.2, total: 7.5 },
    },
    { orderId: id, type: "FinalReceiptPrinted", data: { orderId: id }, occurredAt: T0 },
    { orderId: id, type: "OrderClosed", data: { orderId: id, totalGross: 7.5, totalVat: { "19": 1.2 }, totalNet: 6.3 }, occurredAt: T0 },
  ];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

interface Init {
  settings?: TerminalSettings | null;
  catalog?: CatalogSnapshot | null;
  events?: NewEvent[];
  synced?: Record<string, string>;
}

/** In-memory window.terminal. `log` records the order of persisting calls. */
export function installFakeBridge(init: Init = {}) {
  const log: string[] = [];
  let seq = 0;
  const state = {
    settings: init.settings === undefined ? null : clone(init.settings),
    catalog: init.catalog === undefined ? null : clone(init.catalog),
    events: (init.events ?? []).map((e): LocalEvent => ({ ...clone(e), seq: ++seq })),
    synced: { ...(init.synced ?? {}) },
  };
  const updateListeners = new Set<(version: string) => void>();
  const bridge = {
    appendEvents: vi.fn(async (events: NewEvent[]) => {
      const added = events.map((e): LocalEvent => ({ ...clone(e), seq: ++seq }));
      state.events.push(...added);
      log.push(`appendEvents:${events.map((e) => e.type).join(",")}`);
      return clone(added);
    }),
    readEvents: vi.fn(async () => clone(state.events)),
    markSynced: vi.fn(async (ids: string[]) => {
      for (const id of ids) state.synced[id] = "2026-11-07T12:00:00.000Z";
      log.push(`markSynced:${ids.join(",")}`);
    }),
    readSynced: vi.fn(async () => ({ ...state.synced })),
    saveCatalog: vi.fn(async (c: CatalogSnapshot) => { state.catalog = clone(c); log.push("saveCatalog"); }),
    loadCatalog: vi.fn(async () => clone(state.catalog)),
    saveSettings: vi.fn(async (s: TerminalSettings) => { state.settings = clone(s); log.push("saveSettings"); }),
    loadSettings: vi.fn(async () => clone(state.settings)),
    appVersion: vi.fn(async () => "0.2.0"),
    storeError: vi.fn(async (): Promise<string | null> => null),
    onUsbChoose: vi.fn(() => () => {}),
    chooseUsb: vi.fn(async () => {}),
    onUpdateReady: vi.fn((cb: (version: string) => void) => {
      updateListeners.add(cb);
      return () => { updateListeners.delete(cb); };
    }),
  } satisfies TerminalBridge;
  (window as unknown as { terminal: TerminalBridge }).terminal = bridge;
  const emitUpdateReady = (version: string) => { for (const cb of updateListeners) cb(version); };
  return { bridge, state, log, emitUpdateReady, updateListeners };
}
