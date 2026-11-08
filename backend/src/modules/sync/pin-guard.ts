import { timingSafeEqual } from "node:crypto";

export interface PinGuard {
  isLocked(terminalId: string): boolean;
  recordFailure(terminalId: string): void;
  recordSuccess(terminalId: string): void;
}

interface Entry {
  failures: number;
  lockedUntil: number;
}

/** In-memory brute-force protection, one counter per terminal. */
export function createPinGuard(opts: {
  maxFailures: number;
  lockMs: number;
  now: () => number;
}): PinGuard {
  const entries = new Map<string, Entry>();

  function isLocked(terminalId: string): boolean {
    const entry = entries.get(terminalId);
    if (!entry || entry.lockedUntil === 0) return false;
    if (opts.now() < entry.lockedUntil) return true;
    // Lock expired: the counter restarts.
    entries.delete(terminalId);
    return false;
  }

  return {
    isLocked,
    recordFailure(terminalId) {
      // A locked terminal neither counts up nor extends its lock.
      if (isLocked(terminalId)) return;
      const entry = entries.get(terminalId) ?? { failures: 0, lockedUntil: 0 };
      entry.failures += 1;
      if (entry.failures >= opts.maxFailures) {
        entry.lockedUntil = opts.now() + opts.lockMs;
      }
      entries.set(terminalId, entry);
    },
    recordSuccess(terminalId) {
      entries.delete(terminalId);
    },
  };
}

export function pinMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
