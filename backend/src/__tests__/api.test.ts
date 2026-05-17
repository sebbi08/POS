import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
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
    receiptPdfDir: "/tmp/test",
  },
}));

const app = express();
app.use(express.json());

import authRoutes from "../api/routes/auth.routes";
import terminalsRoutes from "../api/routes/terminals.routes";
import companyRoutes from "../api/routes/company.routes";
import orderRoutes from "../api/routes/orders.routes";
import { orders as orderProjections } from "../modules/orders/orders.projections";

app.use("/api/auth", authRoutes);
app.use("/api/terminals", terminalsRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/orders", orderRoutes);

describe("Auth Routes", () => {
  it("POST /api/auth/login with correct PIN returns admin role", async () => {
    const res = await request(app).post("/api/auth/login").send({ pin: "0000" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("POST /api/auth/login with wrong PIN returns 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ pin: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid PIN");
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
    const res = await request(app).post("/api/terminals").send({ name: "Test" });
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

describe("Order Route Constraints", () => {
  it("POST /api/orders/open rejects when terminal already has an open order", async () => {
    orderProjections.clear();
    orderProjections.set("existing-order", {
      id: "existing-order",
      terminalId: "t1",
      status: "open",
      items: [],
      pickupSeq: 0,
      totalGross: 0,
      totalVat: {},
      totalNet: 0,
      createdAt: new Date(),
    } as any);

    const res = await request(app)
      .post("/api/orders/open")
      .send({ terminalId: "t1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already has an open order");
    expect(res.body.orderId).toBe("existing-order");
  });

  it("POST /api/orders/open succeeds when terminal has no open order", async () => {
    orderProjections.clear();

    const res = await request(app)
      .post("/api/orders/open")
      .send({ terminalId: "t2" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
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
    expect(res.body.error).toContain("Cannot delete terminal with open orders");
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
