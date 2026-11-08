import { SyncError, TIMEOUT_MS, normalizeServerUrl } from "./client";

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Numeric per-part comparison; null if either side is not MAJOR.MINOR.PATCH. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  if (!VERSION_RE.test(a) || !VERSION_RE.test(b)) return null;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** German user text for a version mismatch, or null when the versions are identical. */
export function versionMismatchText(appVersion: string, serverVersion: string): string | null {
  const cmp = compareVersions(appVersion, serverVersion);
  if (cmp === 0) return null;
  if (cmp === -1) return `Kasse ist veraltet (Kasse ${appVersion}, Server ${serverVersion}) – bitte App beenden und neu starten, damit das Update installiert wird`;
  if (cmp === 1) return `Server ist veraltet (Server ${serverVersion}, Kasse ${appVersion}) – bitte zuerst den Server aktualisieren`;
  return "Versionen passen nicht zusammen";
}

/**
 * Asks the public /api/version endpoint; throws SyncError on mismatch or when unreachable.
 * Maps statuses itself: a server older than 0.2.0 has no /api/version and answers 404.
 */
export async function checkServerVersion(serverUrl: string, appVersion: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${normalizeServerUrl(serverUrl)}/api/version`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SyncError("Server nicht erreichbar");
  }
  if (res.status === 404) {
    throw new SyncError(`Server ist veraltet (Server ohne Versionsangabe, Kasse ${appVersion}) – bitte zuerst den Server aktualisieren`);
  }
  if (!res.ok) throw new SyncError(`Serverfehler (${res.status})`);
  let body: { version?: unknown } | null;
  try {
    body = (await res.json()) as { version?: unknown } | null;
  } catch {
    throw new SyncError("Versionen passen nicht zusammen");
  }
  const serverVersion = typeof body?.version === "string" ? body.version : null;
  if (serverVersion === null) throw new SyncError("Versionen passen nicht zusammen");
  const text = versionMismatchText(appVersion, serverVersion);
  if (text) throw new SyncError(text);
}
