import { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";
import { createPinGuard, pinMatches } from "../../modules/sync/pin-guard.js";

const MAX_FAILURES = 5;
const LOCK_MS = 300_000;

export const ADMIN_LOCKED_ERROR =
  "Zu viele falsche PIN-Versuche – bitte in 5 Minuten erneut versuchen";

// One guard for login and checkAdmin, one failure counter per client IP.
let guard = createPinGuard({
  maxFailures: MAX_FAILURES,
  lockMs: LOCK_MS,
  now: Date.now,
});

export function resetAdminAccessForTests(now: () => number = Date.now): void {
  guard = createPinGuard({ maxFailures: MAX_FAILURES, lockMs: LOCK_MS, now });
}

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function isAdminLocked(req: Request): boolean {
  return guard.isLocked(clientKey(req));
}

/** Compares the PIN and records the outcome for the client's IP. */
export function verifyAdminPin(req: Request, pin: string): boolean {
  const key = clientKey(req);
  if (!pinMatches(pin, config.adminPin)) {
    guard.recordFailure(key);
    return false;
  }
  guard.recordSuccess(key);
  return true;
}

export function checkAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAdminLocked(req)) {
    res.status(429).json({ error: ADMIN_LOCKED_ERROR });
    return;
  }
  const header = req.headers["x-admin-pin"];
  const pin = typeof header === "string" ? header : "";
  if (!verifyAdminPin(req, pin)) {
    res.status(403).json({ error: "Administratorzugriff erforderlich" });
    return;
  }
  next();
}
