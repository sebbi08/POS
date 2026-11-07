import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn();

vi.mock("../db", () => ({
  getPool: () => ({
    query: poolQuery,
    connect: () => connect(),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

import syncRoutes from "../api/routes/sync.routes.js";
import { initTables } from "../db.js";
import { orders } from "../modules/orders/orders.projections.js";
import { Order } from "../modules/orders/orders.types.js";
import { BookingUpload } from "../modules/sync/sync.types.js";

// Same mount order as index.ts: the sync router parses its own large bodies.
const app = express();
app.use("/api/sync", syncRoutes);
app.use(express.json());

const terminalRow = {
  id: "t1",
  name: "Bar",
  group_ids: ["g1"],
  print_pickup_receipts: false,
  api_key: "secret-key-value",
};

function poolResponder(sql: string) {
  if (sql.includes("FROM terminals")) return { rows: [terminalRow] };
  if (sql.includes("FROM item_groups"))
    return {
      rows: [
        { id: "g2", name: "Essen", vat_rate: 7 },
        { id: "g1", name: "Getränke", vat_rate: 19 },
      ],
    };
  if (sql.includes("FROM items"))
    return {
      rows: [
        { id: "i1", name: "Bier", group_id: "g1", price: 4.5 },
        { id: "i2", name: "Bratwurst", group_id: "g2", price: 3 },
        { id: "i3", name: "Wasser", group_id: "g1", price: 2 },
      ],
    };
  if (sql.includes("FROM company_settings"))
    return {
      rows: [
        {
          name: "Verein",
          address: "Hauptstr. 1",
          city: "Musterstadt",
          vat_id: "DE123",
        },
      ],
    };
  return { rows: [] };
}

function sale(orderId: string, terminalId = "t1", closed = true): BookingUpload {
  const events: BookingUpload["events"] = [
    {
      type: "OrderOpened",
      data: { id: orderId, terminalId },
      occurredAt: "2026-07-01T18:00:00.000Z",
    },
    {
      type: "ItemAdded",
      data: {
        orderId,
        itemId: "i1",
        name: "Bier",
        qty: 1,
        unitPrice: 4.5,
        vatRate: 19,
        vatAmount: 0.72,
        total: 4.5,
      },
      occurredAt: "2026-07-01T18:00:05.000Z",
    },
  ];
  if (closed) {
    events.push({
      type: "OrderClosed",
      data: { orderId, totalGross: 4.5, totalVat: { 19: 0.72 }, totalNet: 3.78 },
      occurredAt: "2026-07-01T18:00:10.000Z",
    });
  }
  return { orderId, events };
}

function cancellation(orderId: string, cancelsOrderId: string): BookingUpload {
  return {
    orderId,
    events: [
      {
        type: "OrderCancellationCreated",
        data: {
          id: orderId,
          terminalId: "t1",
          title: "Storno",
          cancelsOrderId,
          items: [],
          totalGross: -4.5,
          totalVat: { 19: -0.72 },
          totalNet: -3.78,
          createdAt: "2026-07-01T18:05:00.000Z",
          closedAt: "2026-07-01T18:05:00.000Z",
        },
        occurredAt: "2026-07-01T18:05:00.000Z",
      },
    ],
  };
}

function upload(body: unknown) {
  return request(app)
    .post("/api/sync/bookings")
    .set("x-terminal-id", "t1")
    .set("x-terminal-key", "secret-key-value")
    .send(body as object);
}

function eventInserts() {
  return clientQuery.mock.calls.filter(([sql]) =>
    String(sql).includes("INSERT INTO order_events"),
  );
}

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql: string) => poolResponder(sql));
  clientQuery.mockReset();
  clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes("INSERT INTO synced_orders"))
      return { rows: [{ order_id: params?.[0] }] };
    return { rows: [] };
  });
  release.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  orders.clear();
  vi.mocked(initTables).mockReset();
  vi.mocked(initTables).mockResolvedValue(undefined);
});

describe("GET /api/sync/catalog", () => {
  it("catalog returns only the terminal's groups and items with serverTime", async () => {
    const res = await request(app)
      .get("/api/sync/catalog")
      .set("x-terminal-id", "t1")
      .set("x-terminal-key", "secret-key-value");
    expect(res.status).toBe(200);
    expect(Number.isNaN(Date.parse(res.body.serverTime))).toBe(false);
    expect(res.body.terminal).toEqual({
      id: "t1",
      name: "Bar",
      printPickupReceipts: false,
    });
    expect(res.body.company).toEqual({
      name: "Verein",
      address: "Hauptstr. 1",
      city: "Musterstadt",
      vatId: "DE123",
    });
    expect(res.body.groups).toEqual([
      { id: "g1", name: "Getränke", vatRate: 19 },
    ]);
    expect(res.body.items).toEqual([
      { id: "i1", name: "Bier", groupId: "g1", price: 4.5 },
      { id: "i3", name: "Wasser", groupId: "g1", price: 2 },
    ]);
  });
});

describe("POST /api/sync/bookings", () => {
  it("accepts a valid sale and inserts its events with original occurredAt", async () => {
    const booking = sale("o1");
    const res = await upload({ orders: [booking] });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toEqual(["o1"]);
    expect(res.body.rejected).toEqual([]);
    expect(Number.isNaN(Date.parse(res.body.serverTime))).toBe(false);

    const inserts = eventInserts();
    expect(inserts).toHaveLength(3);
    inserts.forEach(([, params], i) => {
      expect(params[0]).toBe("order-o1");
      expect(params[1]).toBe(booking.events[i].type);
      expect(params[3]).toEqual(new Date(booking.events[i].occurredAt));
    });
    const sqls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls).toContain("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("second upload of the same order is accepted without inserting events", async () => {
    clientQuery.mockImplementation(async () => ({ rows: [] }));
    const res = await upload({ orders: [sale("o1")] });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toContain("o1");
    expect(eventInserts()).toHaveLength(0);
  });

  it("rejects sale from another terminal", async () => {
    const res = await upload({
      orders: [sale("o1"), sale("o2", "t2"), sale("o3")],
    });
    expect(res.status).toBe(200);
    expect(res.body.rejected).toHaveLength(1);
    expect(res.body.rejected[0].orderId).toBe("o2");
    expect(res.body.rejected[0].error).toBeTruthy();
    expect(res.body.accepted).toEqual(["o1", "o3"]);
    const streams = eventInserts().map(([, params]) => params[0]);
    expect(streams).not.toContain("order-o2");
  });

  it("accepts cancellation whose original is earlier in the same batch", async () => {
    const res = await upload({
      orders: [sale("o1"), cancellation("c1", "o1")],
    });
    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.accepted).toEqual(["o1", "c1"]);
    const streams = eventInserts().map(([, params]) => params[0]);
    expect(streams).toContain("order-c1");
  });

  it("accepts cancellation of an earlier synced sale of the same terminal", async () => {
    orders.set("o1", { id: "o1", terminalId: "t1" } as Order);
    const res = await upload({ orders: [cancellation("c1", "o1")] });
    expect(res.body.accepted).toEqual(["c1"]);
  });

  it("rejects cancellation of an unknown, foreign or already cancelled sale", async () => {
    orders.set("o2", { id: "o2", terminalId: "t2" } as Order);
    orders.set("o3", {
      id: "o3",
      terminalId: "t1",
      cancelledByOrderId: "cX",
    } as Order);
    const res = await upload({
      orders: [
        cancellation("c1", "unknown"),
        cancellation("c2", "o2"),
        cancellation("c3", "o3"),
      ],
    });
    expect(res.body.accepted).toEqual([]);
    expect(res.body.rejected.map((r: { orderId: string }) => r.orderId)).toEqual(
      ["c1", "c2", "c3"],
    );
  });

  it("rejects a second cancellation of the same sale in one batch", async () => {
    const res = await upload({
      orders: [sale("o1"), cancellation("c1", "o1"), cancellation("c2", "o1")],
    });
    expect(res.body.accepted).toEqual(["o1", "c1"]);
    expect(res.body.rejected[0].orderId).toBe("c2");
  });

  it("re-upload of a sale and its cancellation is accepted again", async () => {
    // The projection already knows the cancellation from the first upload.
    orders.set("o1", {
      id: "o1",
      terminalId: "t1",
      cancelledByOrderId: "c1",
    } as Order);
    clientQuery.mockImplementation(async () => ({ rows: [] }));
    const res = await upload({
      orders: [sale("o1"), cancellation("c1", "o1")],
    });
    expect(res.body.accepted).toEqual(["o1", "c1"]);
    expect(eventInserts()).toHaveLength(0);
  });

  it("rejects sale whose last event is not OrderClosed", async () => {
    const res = await upload({ orders: [sale("o1", "t1", false)] });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toEqual([]);
    expect(res.body.rejected[0].orderId).toBe("o1");
    expect(res.body.rejected[0].error).toBeTruthy();
    expect(eventInserts()).toHaveLength(0);
  });

  it("rolls back and rejects a booking whose insert fails, then continues", async () => {
    clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("INSERT INTO synced_orders"))
        return { rows: [{ order_id: params?.[0] }] };
      if (String(sql).includes("INSERT INTO order_events") && params?.[0] === "order-o1")
        throw new Error("boom");
      return { rows: [] };
    });
    const res = await upload({ orders: [sale("o1"), sale("o2")] });
    expect(res.body.rejected).toEqual([
      { orderId: "o1", error: "Speichern fehlgeschlagen" },
    ]);
    expect(res.body.accepted).toEqual(["o2"]);
    const sqls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls).toContain("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(connect.mock.calls.length);
  });

  it("returns 400 for a missing orders array or more than 200 orders", async () => {
    const missing = await upload({});
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: "Ungültige Anfrage" });
    const tooMany = await upload({
      orders: Array.from({ length: 201 }, (_, i) => sale(`o${i}`)),
    });
    expect(tooMany.status).toBe(400);
  });

  it("rejects a sale with a further OrderOpened after the first event", async () => {
    const booking = sale("o1");
    booking.events.splice(1, 0, {
      type: "OrderOpened",
      data: { id: "victim", terminalId: "t1", orderId: "o1" },
      occurredAt: "2026-07-01T18:00:01.000Z",
    });
    const res = await upload({ orders: [booking] });
    expect(res.body.accepted).toEqual([]);
    expect(res.body.rejected[0].orderId).toBe("o1");
    expect(eventInserts()).toHaveLength(0);
  });

  it("rejects a sale with a later event for a different order", async () => {
    const booking = sale("o1");
    booking.events[1].data.orderId = "other";
    const res = await upload({ orders: [booking] });
    expect(res.body.accepted).toEqual([]);
    expect(res.body.rejected[0].orderId).toBe("o1");
  });

  it("rejects an order id that already belongs to another terminal", async () => {
    orders.set("o1", { id: "o1", terminalId: "t2" } as Order);
    const res = await upload({ orders: [sale("o1"), sale("o2")] });
    expect(res.body.accepted).toEqual(["o2"]);
    expect(res.body.rejected[0].orderId).toBe("o1");
    const streams = eventInserts().map(([, params]) => params[0]);
    expect(streams).not.toContain("order-o1");
  });

  it("rejects malformed event payloads", async () => {
    const badQty = sale("o1");
    badQty.events[1].data.qty = "1";
    const noName = sale("o2");
    delete noName.events[1].data.name;
    const noVat = sale("o3");
    delete noVat.events[2].data.totalVat;
    const badGross = sale("o4");
    badGross.events[2].data.totalGross = null;
    const noItems = cancellation("c1", "o9");
    noItems.events[0].data.items = "none";
    const badItem = cancellation("c2", "o9");
    badItem.events[0].data.items = [
      { itemId: "i1", name: "Bier", qty: -1, unitPrice: 4.5, vatRate: 19, vatAmount: -0.72, total: "x" },
    ];
    const badDate = cancellation("c3", "o9");
    badDate.events[0].data.closedAt = "gestern";
    const noNet = cancellation("c4", "o9");
    delete noNet.events[0].data.totalNet;
    orders.set("o9", { id: "o9", terminalId: "t1" } as Order);

    const res = await upload({
      orders: [badQty, noName, noVat, badGross, noItems, badItem, badDate, noNet],
    });
    expect(res.body.accepted).toEqual([]);
    expect(
      res.body.rejected.map((r: { orderId: string }) => r.orderId),
    ).toEqual(["o1", "o2", "o3", "o4", "c1", "c2", "c3", "c4"]);
    for (const r of res.body.rejected) expect(r.error).toBeTruthy();
    expect(eventInserts()).toHaveLength(0);
  });

  it("stores the cancelled order id and rejects a cancellation stored earlier for the same sale", async () => {
    orders.set("o1", { id: "o1", terminalId: "t1" } as Order);
    clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("INSERT INTO synced_orders")) {
        expect(params?.[2]).toBe("o1");
        throw Object.assign(new Error("duplicate key"), {
          code: "23505",
          constraint: "idx_synced_orders_cancels",
        });
      }
      return { rows: [] };
    });
    const res = await upload({ orders: [cancellation("c2", "o1")] });
    expect(res.body.rejected).toEqual([
      { orderId: "c2", error: "Buchung wurde bereits storniert" },
    ]);
    const sqls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls).toContain("ROLLBACK");
  });

  it("stores no cancelled order id for a sale", async () => {
    await upload({ orders: [sale("o1")] });
    const insert = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO synced_orders"),
    );
    expect(insert?.[1]).toEqual(["o1", "t1", null]);
  });

  it("rejects only the booking whose connection fails and keeps going", async () => {
    connect.mockRejectedValueOnce(new Error("pool exhausted"));
    const res = await upload({ orders: [sale("o1"), sale("o2")] });
    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([
      { orderId: "o1", error: "Speichern fehlgeschlagen" },
    ]);
    expect(res.body.accepted).toEqual(["o2"]);
  });

  it("answers 500 with a German message when the database is unavailable", async () => {
    vi.mocked(initTables).mockRejectedValue(new Error("db down"));
    const res = await upload({ orders: [sale("o1")] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Serverfehler" });
  });

  it("accepts an upload larger than the default JSON limit", async () => {
    const booking = sale("o1");
    booking.events[1].data.name = "x".repeat(300_000);
    const res = await upload({ orders: [booking] });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toEqual(["o1"]);
  });

  it("POST /api/sync/bookings without key returns 401", async () => {
    const res = await request(app)
      .post("/api/sync/bookings")
      .send({ orders: [sale("o1")] });
    expect(res.status).toBe(401);
  });
});
