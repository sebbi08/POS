import { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";
import { createPinGuard, pinMatches } from "../../modules/sync/pin-guard.js";
import { Terminal } from "../../modules/terminals/terminals.types.js";
import { serverVersion } from "../../version.js";

const MAX_FAILURES = 5;
const LOCK_MS = 300_000;

let guard = createPinGuard({
  maxFailures: MAX_FAILURES,
  lockMs: LOCK_MS,
  now: Date.now,
});

export function resetSyncAccessForTests(now: () => number = Date.now): void {
  guard = createPinGuard({ maxFailures: MAX_FAILURES, lockMs: LOCK_MS, now });
}

function header(req: Request, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
}

/** Runs after checkTerminalKey: version match, lockout, then admin PIN. */
export function checkSyncAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (header(req, "x-terminal-version") !== serverVersion()) {
    res.status(409).json({
      error: "Versionen passen nicht zusammen",
      serverVersion: serverVersion(),
    });
    return;
  }
  const terminal = res.locals.terminal as Terminal;
  if (guard.isLocked(terminal.id)) {
    res
      .status(429)
      .json({ error: "Zu viele Fehlversuche, bitte später erneut versuchen" });
    return;
  }
  if (!pinMatches(header(req, "x-admin-pin"), config.adminPin)) {
    guard.recordFailure(terminal.id);
    res.status(401).json({ error: "Admin-PIN falsch" });
    return;
  }
  guard.recordSuccess(terminal.id);
  next();
}
