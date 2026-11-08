import { FormatTooNewError } from "./migrations";
import type { LocalStore } from "./store";

const RETENTION_DAYS = 30;

export const STORE_PREPARE_ERROR = "Lokale Daten konnten nicht vorbereitet werden – bitte App neu starten";

/**
 * Migrates and compacts the store at startup. Resolves with the blocking message for the
 * renderer, or null if the store may be used.
 */
export async function prepareStore(store: LocalStore, now: Date): Promise<string | null> {
  try {
    await store.migrate();
  } catch (err) {
    // Nothing may write to a store of a newer format or to a half-migrated one: no compact, no store IPC.
    if (err instanceof FormatTooNewError) return err.message;
    console.error("migrate failed", err);
    return STORE_PREPARE_ERROR;
  }
  try {
    await store.compact(RETENTION_DAYS, now);
  } catch (err) {
    // Never keep the till from starting because of housekeeping; the error resurfaces on read.
    console.error("compact failed", err);
  }
  return null;
}
