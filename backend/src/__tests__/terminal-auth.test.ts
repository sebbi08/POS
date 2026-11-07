import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("../db", () => ({
  getPool: () => ({ query }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

import { checkTerminalKey } from "../api/middleware/terminal-auth.middleware.js";
import { findTerminalByKey } from "../modules/terminals/terminals.repository.js";

const row = {
  id: "t1",
  name: "Bar",
  group_ids: ["g1"],
  print_pickup_receipts: true,
  api_key: "secret-key-value",
};

const app = express();
app.get("/x", checkTerminalKey, (_req, res) => {
  res.json(res.locals.terminal);
});

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [row] });
});

describe("checkTerminalKey", () => {
  it("rejects missing headers with 401 and German message", async () => {
    const res = await request(app).get("/x");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Terminal-Schlüssel ungültig");
  });

  it("rejects wrong key", async () => {
    const res = await request(app)
      .get("/x")
      .set("x-terminal-id", "t1")
      .set("x-terminal-key", "wrong-key-value!");
    expect(res.status).toBe(401);
  });

  it("accepts correct key and sets res.locals.terminal", async () => {
    const res = await request(app)
      .get("/x")
      .set("x-terminal-id", "t1")
      .set("x-terminal-key", "secret-key-value");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: "t1",
      name: "Bar",
      groupIds: ["g1"],
      printPickupReceipts: true,
    });
  });
});

describe("findTerminalByKey", () => {
  it("returns null for key of different length", async () => {
    await expect(findTerminalByKey("t1", "short")).resolves.toBeNull();
  });

  it("returns null when terminal has no key", async () => {
    query.mockResolvedValue({ rows: [{ ...row, api_key: null }] });
    await expect(findTerminalByKey("t1", "x")).resolves.toBeNull();
  });
});
