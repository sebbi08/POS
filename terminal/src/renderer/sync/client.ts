import type { BookingUpload, CatalogSnapshot, UploadResponse } from "../../shared/contract";
import type { TerminalSettings } from "../../shared/types";
import { versionMismatchText } from "./version";

export const CLOCK_WARN_MS = 5 * 60 * 1000;
export const TIMEOUT_MS = 15_000;
const BATCH_SIZE = 50;

export interface SyncAuth { pin: string; appVersion: string }

const LOCK_TEXT = "Zu viele falsche PIN-Versuche – bitte in 5 Minuten erneut versuchen";

export interface UploadPartial { accepted: string[]; rejected: { orderId: string; error: string }[] }

/** Message is German and shown to the user as is. */
export class SyncError extends Error {
  partial?: UploadPartial;
  constructor(message: string, partial?: UploadPartial) {
    super(message);
    this.name = "SyncError";
    this.partial = partial;
  }
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

function authHeaders(s: TerminalSettings, auth: SyncAuth): Record<string, string> {
  return { "x-terminal-id": s.terminalId, "x-terminal-key": s.terminalKey, "x-terminal-version": auth.appVersion, "x-admin-pin": auth.pin };
}

/** Performs the request and returns parsed JSON plus the server clock skew measured around it. */
export async function request<T>(url: string, init: RequestInit, appVersion?: string): Promise<{ body: T; clockSkewMs: number }> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SyncError("Server nicht erreichbar");
  }
  const end = Date.now();
  if (res.status === 401 || res.status === 409 || res.status === 429) {
    let err: { error?: unknown; serverVersion?: unknown } = {};
    try { err = (await res.json()) ?? {}; } catch { /* unparseable body: use fallbacks */ }
    if (res.status === 401) {
      throw new SyncError(err.error === "Admin-PIN falsch" ? "Admin-PIN falsch" : "Terminal-Schlüssel ungültig – bitte Terminal neu einrichten");
    }
    if (res.status === 429) throw new SyncError(typeof err.error === "string" ? err.error : LOCK_TEXT);
    const mismatch = typeof err.serverVersion === "string" && appVersion ? versionMismatchText(appVersion, err.serverVersion) : null;
    throw new SyncError(mismatch ?? "Versionen passen nicht zusammen");
  }
  if (!res.ok) throw new SyncError(`Serverfehler (${res.status})`);
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    throw new SyncError("Server nicht erreichbar");
  }
  const serverTime = (body as { serverTime?: string } | null)?.serverTime;
  const clockSkewMs = serverTime ? Date.parse(serverTime) - (start + end) / 2 : 0;
  return { body, clockSkewMs };
}

export async function listTerminals(serverUrl: string): Promise<{ id: string; name: string }[]> {
  const { body } = await request<{ id: string; name: string }[]>(`${normalizeServerUrl(serverUrl)}/api/terminals`, {});
  return body.map((t) => ({ id: t.id, name: t.name }));
}

export async function fetchCatalog(s: TerminalSettings, auth: SyncAuth): Promise<{ catalog: CatalogSnapshot; clockSkewMs: number }> {
  const { body, clockSkewMs } = await request<CatalogSnapshot>(`${normalizeServerUrl(s.serverUrl)}/api/sync/catalog`, { headers: authHeaders(s, auth) }, auth.appVersion);
  return { catalog: body, clockSkewMs };
}

/** Sequential batches; on failure the SyncError carries what earlier batches already settled. */
export async function uploadAll(
  s: TerminalSettings,
  uploads: BookingUpload[],
  auth: SyncAuth,
): Promise<{ accepted: string[]; rejected: { orderId: string; error: string }[]; clockSkewMs: number | null }> {
  const accepted: string[] = [];
  const rejected: { orderId: string; error: string }[] = [];
  let clockSkewMs: number | null = null;
  const url = `${normalizeServerUrl(s.serverUrl)}/api/sync/bookings`;
  for (let i = 0; i < uploads.length; i += BATCH_SIZE) {
    try {
      const r = await request<UploadResponse>(url, {
        method: "POST",
        headers: { ...authHeaders(s, auth), "content-type": "application/json" },
        body: JSON.stringify({ orders: uploads.slice(i, i + BATCH_SIZE) }),
      }, auth.appVersion);
      accepted.push(...r.body.accepted);
      rejected.push(...r.body.rejected);
      clockSkewMs = r.clockSkewMs;
    } catch (e) {
      if (e instanceof SyncError) throw new SyncError(e.message, { accepted, rejected });
      throw e;
    }
  }
  return { accepted, rejected, clockSkewMs };
}
