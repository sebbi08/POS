import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogSnapshot } from "../../shared/contract";
import type { LocalEvent, NewEvent, TerminalSettings } from "../../shared/types";
import {
  cmdAddItem, cmdCancel, cmdChangeQty, cmdCheckout, cmdDiscard, cmdRemoveLine,
  lastPrintable, openOrderOf, projectOrders, type LocalOrder,
} from "../domain/orders";
import { cancellableOrders, hasPendingUploads, pendingUploads, unsyncedCount } from "../domain/sync-selection";
import { printJobs } from "../print/usb";
import { fetchCatalog as requestCatalog, SyncError, uploadAll, type SyncAuth } from "../sync/client";
import { checkServerVersion } from "../sync/version";
import {
  clockWarningText, SAVE_FAILED, SAVE_SUSPECT, syncErrorText, TERMINAL_LOCKED, uploadMessage, type Message,
} from "./messages";
import { printFailureText, receiptJobs } from "./receipts";

interface Data {
  settings: TerminalSettings | null;
  catalog: CatalogSnapshot | null;
  events: LocalEvent[];
  synced: Record<string, string>;
}

type SyncKind = "catalog" | "upload";

/** An open „Admin-PIN“ prompt; `resolve(null)` means cancelled. */
export interface PinPrompt { resolve: (pin: string | null) => void }

const EMPTY: Data = { settings: null, catalog: null, events: [], synced: {} };
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const bridge = () => window.terminal;

/**
 * State and actions of the till. Local actions run one after another through a single queue:
 * persist (appendEvents) first, then update state, then print. Server calls run outside the
 * queue so selling never waits for the network; only their local writes are queued.
 */
export function useTerminal() {
  const [data, setData] = useState<Data>(EMPTY);
  const dataRef = useRef<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState(0);
  const [sync, setSync] = useState<SyncKind | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [pinPrompt, setPinPrompt] = useState<PinPrompt | null>(null);
  /** Read once at startup; "" when unreadable, which every server then refuses as a mismatch. */
  const appVersion = useRef<Promise<string> | null>(null);
  const getAppVersion = () => (appVersion.current ??= bridge().appVersion().catch(() => ""));
  const queue = useRef<Promise<void>>(Promise.resolve());
  const syncingRef = useRef(false);
  /** Orders in an upload that is still waiting for the server; they must not be cancelled meanwhile. */
  const uploading = useRef(new Set<string>());
  const projection = useRef<{ events: LocalEvent[]; orders: Map<string, LocalOrder> } | null>(null);

  const commit = useCallback((patch: Partial<Data>) => {
    dataRef.current = { ...dataRef.current, ...patch };
    setData(dataRef.current);
  }, []);

  /** Orders projected from an events array, cached for the last array. */
  const ordersOf = useCallback((events: LocalEvent[]) => {
    if (projection.current?.events !== events) projection.current = { events, orders: projectOrders(events) };
    return projection.current.orders;
  }, []);
  /** Orders of the latest committed events; queued actions use this, never render-time state. */
  const currentOrders = useCallback(() => ordersOf(dataRef.current.events), [ordersOf]);

  useEffect(() => {
    let alive = true;
    const t = bridge();
    Promise.all([t.loadSettings(), t.loadCatalog(), t.readEvents(), t.readSynced()])
      .then(([settings, catalog, events, synced]) => {
        if (!alive) return;
        commit({ settings, catalog, events, synced });
        setReady(true);
      })
      .catch(() => {
        if (alive) setMessage({ kind: "error", text: "Lokale Daten konnten nicht gelesen werden – bitte Kasse neu starten" });
      });
    return () => { alive = false; };
  }, [commit]);

  useEffect(() => bridge().onUpdateReady(setUpdateVersion), []);
  useEffect(() => { void getAppVersion(); }, []);

  const enqueue = useCallback((task: () => Promise<void>): Promise<void> => {
    setPending((n) => n + 1);
    const run = queue.current.then(task).catch((err: unknown) => {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    });
    queue.current = run;
    return run.finally(() => setPending((n) => n - 1));
  }, []);

  /**
   * Appends the events. On failure the store may hold a prefix of them, so the events are re-read
   * (never retried) and the caller decides from the re-projected state what actually happened.
   */
  const persist = useCallback(async (events: NewEvent[]): Promise<boolean> => {
    try {
      const added = await bridge().appendEvents(events);
      commit({ events: [...dataRef.current.events, ...added] });
      return true;
    } catch {
      try { commit({ events: await bridge().readEvents() }); } catch { /* keep the last known state */ }
      return false;
    }
  }, [commit]);

  const persistOrReport = useCallback(async (events: NewEvent[]) => {
    if (!(await persist(events))) setMessage(SAVE_FAILED);
  }, [persist]);

  /** Prints the receipts; returns the German error text, or null when printed. */
  const print = useCallback(async (order: LocalOrder, copy: boolean): Promise<string | null> => {
    const { settings, catalog } = dataRef.current;
    if (!settings || !catalog) return null;
    try {
      await printJobs(settings.printer, receiptJobs(order, catalog, settings, copy));
      return null;
    } catch (err) {
      return printFailureText(err);
    }
  }, []);

  /**
   * Prints a booking that is on disk. `saved` false means appendEvents reported an error although
   * the re-read shows the booking: it is kept and printed, but the storage problem is not hidden.
   */
  const printBooking = useCallback(async (order: LocalOrder, saved: boolean) => {
    const printError = await print(order, false);
    if (!saved) {
      setMessage({ kind: "error", text: printError ? `${SAVE_SUSPECT.text} ${printError}` : SAVE_SUSPECT.text });
    } else if (printError) {
      setMessage({ kind: "error", text: printError });
    }
  }, [print]);

  const saveSettingsNow = useCallback(async (next: TerminalSettings): Promise<boolean> => {
    try {
      await bridge().saveSettings(next);
      commit({ settings: next });
      return true;
    } catch {
      setMessage(SAVE_FAILED);
      return false;
    }
  }, [commit]);

  const beginSync = (kind: SyncKind) => {
    if (syncingRef.current) return false;
    syncingRef.current = true;
    setSync(kind);
    setMessage(null);
    return true;
  };
  const endSync = () => {
    syncingRef.current = false;
    setSync(null);
  };

  /** Opens the PIN dialog; the PIN is only handed to the caller, never kept in state. */
  const requestPin = () => new Promise<string | null>((resolve) => {
    setPinPrompt({ resolve: (pin) => { setPinPrompt(null); resolve(pin); } });
  });

  /**
   * Before every sync: the server must run the same version, then the admin PIN is asked for.
   * Shows the error and returns null on a mismatch; returns null silently when cancelled.
   */
  const authorize = async (serverUrl: string): Promise<SyncAuth | null> => {
    const version = await getAppVersion();
    try {
      await checkServerVersion(serverUrl, version);
    } catch (err) {
      setMessage({ kind: "error", text: syncErrorText(err) });
      return null;
    }
    const pin = await requestPin();
    return pin === null ? null : { pin, appVersion: version };
  };

  const addItem = (itemId: string) => enqueue(async () => {
    const { settings, catalog } = dataRef.current;
    const item = catalog?.items.find((i) => i.id === itemId);
    const group = item && catalog?.groups.find((g) => g.id === item.groupId);
    if (!settings || !item || !group) return;
    await persistOrReport(cmdAddItem(openOrderOf(currentOrders()), settings.terminalId, item, group, now(), newId));
  });

  const changeQty = (itemId: string, delta: 1 | -1) => enqueue(async () => {
    const open = openOrderOf(currentOrders());
    if (open) await persistOrReport(cmdChangeQty(open, itemId, delta, now()));
  });

  const removeLine = (itemId: string) => enqueue(async () => {
    const open = openOrderOf(currentOrders());
    if (open) await persistOrReport(cmdRemoveLine(open, itemId, now()));
  });

  const discard = () => enqueue(async () => {
    const open = openOrderOf(currentOrders());
    if (open) await persistOrReport(cmdDiscard(open, now()));
  });

  const checkout = () => enqueue(async () => {
    const { catalog } = dataRef.current;
    const open = openOrderOf(currentOrders());
    if (!catalog || !open || open.lines.length === 0) return;
    setMessage(null);
    const saved = await persist(cmdCheckout(open, catalog.terminal.printPickupReceipts, now()));
    // Print whatever is closed on disk, even if the append reported an error after writing.
    const closed = currentOrders().get(open.id);
    if (closed?.status !== "closed") {
      if (!saved) setMessage(SAVE_FAILED);
      return;
    }
    await printBooking(closed, saved);
  });

  const cancel = (orderId: string) => enqueue(async () => {
    const { synced } = dataRef.current;
    const original = cancellableOrders(currentOrders(), synced).find((o) => o.id === orderId);
    if (!original || uploading.current.has(orderId)) {
      setMessage({ kind: "error", text: "Buchung kann nicht mehr storniert werden" });
      return;
    }
    setMessage(null);
    const saved = await persist(cmdCancel(original, now(), newId));
    const orders = currentOrders();
    const cancellation = orders.get(orders.get(orderId)?.cancelledByOrderId ?? "");
    if (!cancellation) {
      if (!saved) setMessage(SAVE_FAILED);
      return;
    }
    await printBooking(cancellation, saved);
  });

  const reprintLast = () => enqueue(async () => {
    const last = lastPrintable(currentOrders());
    if (!last) return;
    setMessage(null);
    const printError = await print(last, true);
    if (printError) setMessage({ kind: "error", text: printError });
  });

  /**
   * Fetches the catalog; with `setup` it uses those credentials and stores them on success.
   * While bookings wait for the upload, a setup may only change server and key, never the terminal:
   * the bookings carry the terminal id and would be rejected by the new one.
   */
  const fetchCatalog = async (setup?: TerminalSettings): Promise<boolean> => {
    const current = dataRef.current;
    if (setup && current.settings && setup.terminalId !== current.settings.terminalId
        && hasPendingUploads(currentOrders(), current.synced)) {
      setMessage({ kind: "error", text: TERMINAL_LOCKED });
      return false;
    }
    const credentials = setup ?? current.settings;
    if (!credentials || !beginSync("catalog")) return false;
    try {
      const auth = await authorize(credentials.serverUrl);
      if (!auth) return false;
      let result: Awaited<ReturnType<typeof requestCatalog>>;
      try {
        result = await requestCatalog(credentials, auth);
      } catch (err) {
        setMessage({ kind: "error", text: syncErrorText(err) });
        return false;
      }
      let saved = false;
      await enqueue(async () => {
        const previous = dataRef.current;
        const base = setup ?? previous.settings;
        if (!base) return;
        const next = { ...base, lastCatalogFetchAt: now(), clockSkewMs: result.clockSkewMs };
        try {
          await bridge().saveCatalog(result.catalog);
        } catch {
          setMessage(SAVE_FAILED);
          return;
        }
        try {
          await bridge().saveSettings(next);
        } catch {
          setMessage(SAVE_FAILED);
          if (!setup) {
            commit({ catalog: result.catalog }); // same terminal: the new catalog is valid as saved
          } else if (previous.catalog) {
            // Setup: a new terminal's catalog must not stay on disk next to the old credentials.
            try { await bridge().saveCatalog(previous.catalog); } catch { /* error already shown */ }
          }
          return;
        }
        commit({ catalog: result.catalog, settings: next });
        setMessage({ kind: "info", text: "Artikel aktualisiert" });
        saved = true;
      });
      return saved;
    } finally {
      endSync();
    }
  };

  const upload = async (): Promise<void> => {
    const { settings } = dataRef.current;
    if (!settings || !beginSync("upload")) return;
    const pendingNow = () => pendingUploads(dataRef.current.events, currentOrders(), dataRef.current.synced);
    try {
      if (pendingNow().length === 0) {
        setMessage(uploadMessage([], [], null));
        return;
      }
      const auth = await authorize(settings.serverUrl);
      if (!auth) return;
      // Bookings may have been closed while the PIN dialog was open: send what is pending now.
      const uploads = pendingNow();
      for (const u of uploads) uploading.current.add(u.orderId);
      let accepted: string[] = [];
      let rejected: { orderId: string; error: string }[] = [];
      let clockSkewMs: number | null = null;
      let failure: string | null = null;
      try {
        ({ accepted, rejected, clockSkewMs } = await uploadAll(settings, uploads, auth));
      } catch (err) {
        failure = syncErrorText(err);
        if (err instanceof SyncError && err.partial) ({ accepted, rejected } = err.partial);
      }
      await enqueue(async () => {
        try {
          if (accepted.length > 0) await bridge().markSynced(accepted);
          setMessage(uploadMessage(accepted, rejected, failure));
        } catch {
          setMessage(SAVE_FAILED); // the server knows them; the next upload is acknowledged again
        }
        try { commit({ synced: await bridge().readSynced() }); } catch { /* keep the last known state */ }
        const current = dataRef.current.settings;
        if (clockSkewMs !== null && current) await saveSettingsNow({ ...current, clockSkewMs });
      });
    } finally {
      uploading.current.clear();
      endSync();
    }
  };

  /** Merges the patch into the settings current when the write runs, so no queued change is lost. */
  const saveSettings = (patch: Partial<TerminalSettings>) => enqueue(async () => {
    const current = dataRef.current.settings;
    if (current) await saveSettingsNow({ ...current, ...patch });
  });
  const dismissMessage = () => setMessage(null);

  const orders = ordersOf(data.events);
  return {
    ready,
    settings: data.settings,
    catalog: data.catalog,
    orders,
    openOrder: openOrderOf(orders),
    unsyncedCount: unsyncedCount(orders, data.synced),
    hasPendingUploads: hasPendingUploads(orders, data.synced),
    cancellable: cancellableOrders(orders, data.synced),
    canReprint: lastPrintable(orders) !== undefined,
    clockWarning: clockWarningText(data.settings?.clockSkewMs),
    busy: pending > 0,
    syncing: sync !== null,
    uploading: sync === "upload",
    message,
    updateVersion,
    pinPrompt,
    actions: {
      addItem, changeQty, removeLine, discard, checkout, cancel, reprintLast,
      fetchCatalog, upload, saveSettings, dismissMessage,
    },
  };
}

export type Terminal = ReturnType<typeof useTerminal>;
