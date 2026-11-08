import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({ config: { adminPin: "0000" } }));
vi.mock("../api/middleware/terminal-auth.middleware", () => ({
  checkTerminalKey: (req: any, res: any, next: any) => {
    res.locals.terminal = { id: String(req.headers["x-test-terminal"] ?? "t1") };
    next();
  },
}));

import {
  checkSyncAccess,
  resetSyncAccessForTests,
} from "../api/middleware/sync-access.middleware.js";
import { checkTerminalKey } from "../api/middleware/terminal-auth.middleware.js";
import { pinMatches } from "../modules/sync/pin-guard.js";
import { serverVersion } from "../version.js";

const app = express();
app.get("/x", checkTerminalKey, checkSyncAccess, (_req, res) => {
  res.json({ ok: true });
});

let nowMs = 1_000_000;

function call(
  pin: string | undefined,
  version: string | null = serverVersion(),
  terminal = "t1",
) {
  const r = request(app).get("/x").set("x-test-terminal", terminal);
  if (version !== null) r.set("x-terminal-version", version);
  if (pin !== undefined) r.set("x-admin-pin", pin);
  return r;
}

beforeEach(() => {
  nowMs = 1_000_000;
  resetSyncAccessForTests(() => nowMs);
});

describe("checkSyncAccess", () => {
  it("passes with matching version and correct PIN", async () => {
    expect((await call("0000")).status).toBe(200);
  });

  it("missing x-terminal-version → 409 with serverVersion", async () => {
    const res = await call("0000", null);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "Versionen passen nicht zusammen",
      serverVersion: serverVersion(),
    });
  });

  it("different version → 409 before PIN is checked", async () => {
    for (let i = 0; i < 6; i++) {
      expect((await call("9999", "0.0.1")).status).toBe(409);
    }
    // Failure counter untouched: still not locked.
    expect((await call("0000")).status).toBe(200);
  });

  it("wrong PIN → 401 Admin-PIN falsch", async () => {
    const res = await call("1234");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Admin-PIN falsch" });
  });

  it("missing PIN counts as wrong PIN", async () => {
    expect((await call(undefined)).status).toBe(401);
  });

  it("5 wrong PINs lock the terminal: 6th request with correct PIN → 429", async () => {
    for (let i = 0; i < 5; i++) expect((await call("1")).status).toBe(401);
    expect((await call("0000")).status).toBe(429);
  });

  it("lock expires after 5 minutes and counter restarts", async () => {
    for (let i = 0; i < 5; i++) await call("1");
    expect((await call("0000")).status).toBe(429);
    nowMs += 300_000;
    expect((await call("0000")).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await call("1")).status).toBe(401);
    expect((await call("0000")).status).toBe(200);
  });

  it("requests while locked do not extend the lock", async () => {
    for (let i = 0; i < 5; i++) await call("1");
    nowMs += 200_000;
    expect((await call("1")).status).toBe(429);
    nowMs += 100_000;
    expect((await call("0000")).status).toBe(200);
  });

  it("correct PIN resets the failure count", async () => {
    for (let i = 0; i < 4; i++) await call("1");
    expect((await call("0000")).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await call("1")).status).toBe(401);
    expect((await call("0000")).status).toBe(200);
  });

  it("lock is per terminal", async () => {
    for (let i = 0; i < 5; i++) await call("1", serverVersion(), "t1");
    expect((await call("0000", serverVersion(), "t1")).status).toBe(429);
    expect((await call("0000", serverVersion(), "t2")).status).toBe(200);
  });
});

describe("pinMatches", () => {
  it("returns false for different lengths without throwing", () => {
    expect(pinMatches("0000", "00000")).toBe(false);
  });
  it("compares equal and unequal values", () => {
    expect(pinMatches("0000", "0000")).toBe(true);
    expect(pinMatches("0001", "0000")).toBe(false);
  });
});
