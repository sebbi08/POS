import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi
      .fn()
      .mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/orders/order-eventstore", () => ({
  appendOrderEvent: vi.fn().mockResolvedValue(undefined),
  readOrderStream: vi.fn().mockResolvedValue([]),
  subscribeToOrderEvents: vi.fn(),
  replayOrderEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../projections/runner", () => ({
  registerProjection: vi.fn(),
  startProjections: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
  },
}));

const app = express();
app.use(express.json());

import authRoutes from "../api/routes/auth.routes.js";
import companyRoutes from "../api/routes/company.routes.js";
import orderRoutes from "../api/routes/orders.routes.js";
import terminalsRoutes from "../api/routes/terminals.routes.js";
import { getPool } from "../db.js";
import { orders as orderProjections } from "../modules/orders/orders.projections.js";

app.use("/api/auth", authRoutes);
app.use("/api/terminals", terminalsRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/orders", orderRoutes);

describe("Auth Routes", () => {
  it("POST /api/auth/login with correct PIN returns admin role", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ pin: "0000" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("POST /api/auth/login with wrong PIN returns 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ pin: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Ungültige PIN");
  });

  it("POST /api/auth/login with short PIN returns 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ pin: "12" });
    expect(res.status).toBe(400);
  });
});

describe("Terminals Routes", () => {
  it("GET /api/terminals returns terminal list (public)", async () => {
    const res = await request(app).get("/api/terminals");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/terminals without admin PIN returns 403", async () => {
    const res = await request(app)
      .post("/api/terminals")
      .send({ name: "Test" });
    expect(res.status).toBe(403);
  });

  it("POST /api/terminals with admin PIN creates terminal", async () => {
    const res = await request(app)
      .post("/api/terminals")
      .set("x-admin-pin", "0000")
      .send({ name: "Bar", groupIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });
});

describe("Terminal key routes", () => {
  it("POST /api/terminals/:id/key without admin PIN returns 403", async () => {
    const res = await request(app).post("/api/terminals/t1/key");
    expect(res.status).toBe(403);
  });

  it("POST /api/terminals/:id/key returns a 32-char key", async () => {
    vi.mocked(getPool().query).mockResolvedValueOnce({
      rows: [{ id: "t1", name: "Bar", group_ids: [], print_pickup_receipts: true }],
    } as never);
    const res = await request(app)
      .post("/api/terminals/t1/key")
      .set("x-admin-pin", "0000");
    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("POST /api/terminals/:id/key returns 404 for unknown terminal", async () => {
    const res = await request(app)
      .post("/api/terminals/nope/key")
      .set("x-admin-pin", "0000");
    expect(res.status).toBe(404);
  });
});

describe("Company Routes", () => {
  it("GET /api/company returns company settings (public)", async () => {
    const res = await request(app).get("/api/company");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
  });

  it("PUT /api/company without admin PIN returns 403", async () => {
    const res = await request(app).put("/api/company").send({ name: "Test" });
    expect(res.status).toBe(403);
  });
});

describe("Order Routes", () => {
  it("POST /api/orders/:id/cancel without admin PIN returns 403", async () => {
    const res = await request(app)
      .post("/api/orders/some-order/cancel")
      .send({ reason: "x" });
    expect(res.status).toBe(403);
  });

  it("POST /api/orders/open returns 404", async () => {
    const res = await request(app)
      .post("/api/orders/open")
      .send({ terminalId: "t1" });
    expect(res.status).toBe(404);
  });
});

describe("Terminal Delete Constraint", () => {
  it("DELETE /api/terminals/:id rejects when terminal has open orders", async () => {
    orderProjections.clear();
    orderProjections.set("open-order", {
      id: "open-order",
      terminalId: "term-to-delete",
      status: "open",
      items: [],
      pickupSeq: 0,
      totalGross: 0,
      totalVat: {},
      totalNet: 0,
      createdAt: new Date(),
    } as any);

    const res = await request(app)
      .delete("/api/terminals/term-to-delete")
      .set("x-admin-pin", "0000");

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Terminal mit offenen Bestellungen kann nicht gelöscht werden");
  });

  it("DELETE /api/terminals/:id succeeds when terminal has no open orders", async () => {
    orderProjections.clear();

    const res = await request(app)
      .delete("/api/terminals/some-terminal")
      .set("x-admin-pin", "0000");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("deleted");
  });
});
