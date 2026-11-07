import { CLOCK_WARN_MS, SyncError } from "../sync/client";

export interface Message { kind: "error" | "info"; text: string }

export const SAVE_FAILED: Message = { kind: "error", text: "Speichern fehlgeschlagen – bitte erneut versuchen" };

/** appendEvents failed, yet the re-read store holds the booking. */
export const SAVE_SUSPECT: Message = {
  kind: "error", text: "Speichern meldete einen Fehler – Buchung ist vorhanden, bitte Speicherplatz prüfen.",
};

export function syncErrorText(err: unknown): string {
  return err instanceof SyncError ? err.message : "Unerwartete Antwort vom Server";
}

export function clockWarningText(clockSkewMs: number | null | undefined): string | null {
  if (clockSkewMs == null || Math.abs(clockSkewMs) <= CLOCK_WARN_MS) return null;
  const minutes = Math.round(Math.abs(clockSkewMs) / 60_000);
  return `Die Uhr dieses Rechners weicht um ${minutes} Minuten von der Serverzeit ab. Bitte Uhrzeit prüfen.`;
}

/** Result line of „Buchungen übertragen“; `failure` is the SyncError text if the upload broke off. */
export function uploadMessage(
  accepted: string[], rejected: { orderId: string; error: string }[], failure: string | null,
): Message {
  let summary = `${accepted.length} Buchung(en) übertragen`;
  if (rejected.length > 0) summary += `, ${rejected.length} abgelehnt: ${rejected[0].error}`;
  if (failure === null) return { kind: rejected.length > 0 ? "error" : "info", text: summary };
  if (accepted.length + rejected.length === 0) return { kind: "error", text: failure };
  return { kind: "error", text: `${failure} – ${summary}` };
}
