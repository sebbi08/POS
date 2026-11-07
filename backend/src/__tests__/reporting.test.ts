import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    receiptPdfDir: "/tmp/test",
  },
}));

import reportingRoutes from "../api/routes/reporting.routes.js";
import {
  initOrderProjections,
  orders,
} from "../modules/orders/orders.projections.js";
import {
  getReport,
  listTransactions,
} from "../modules/reporting/reporting.projections.js";
import { registerProjection } from "../projections/runner.js";

type Item = {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  total: number;
};

const espresso = (qty: number, vatRate = 19): Item => ({
  itemId: "i1",
  name: "Espresso",
  qty,
  unitPrice: 2.5,
  vatRate,
  vatAmount: 0.4 * qty,
  total: 2.5 * qty,
});

describe("Reporting", () => {
  let orderHandler: (event: any, streamId: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    orders.clear();
    initOrderProjections();
    orderHandler = vi
      .mocked(registerProjection)
      .mock.calls.find((c) => c[0] === "orders")![2] as any;
  });

  function sale(
    id: string,
    at: string,
    opts: {
      terminalId?: string;
      items?: Item[];
      totalGross?: number;
      totalVat?: Record<number, number>;
      totalNet?: number;
      cancelled?: boolean;
    } = {},
  ) {
    const occurredAt = new Date(at);
    orderHandler(
      {
        type: "OrderOpened",
        data: { id, terminalId: opts.terminalId ?? "t1" },
        occurredAt,
      },
      `order-${id}`,
    );
    for (const item of opts.items ?? []) {
      orderHandler(
        { type: "ItemAdded", data: { orderId: id, ...item }, occurredAt },
        `order-${id}`,
      );
    }
    orderHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: id,
          totalGross: opts.totalGross ?? 0,
          totalVat: opts.totalVat ?? {},
          totalNet: opts.totalNet ?? 0,
          cancelled: opts.cancelled,
        },
        occurredAt,
      },
      `order-${id}`,
    );
  }

  function cancel(id: string, cancelsOrderId: string, at: string) {
    orderHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id,
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId,
          items: [],
          totalGross: -10,
          totalVat: {},
          totalNet: -10,
          createdAt: at,
          closedAt: at,
        },
        occurredAt: new Date(at),
      },
      `order-${id}`,
    );
  }

  it("counts a sale closed at 23:30 Berlin time on that calendar day", () => {
    sale("o1", "2026-06-01T21:30:00Z", { totalGross: 1 });

    expect(getReport("2026-06-01", "2026-06-01").orderCount).toBe(1);
    expect(getReport("2026-06-02", "2026-06-02").orderCount).toBe(0);
  });

  it("range spanning two days sums both", () => {
    sale("o1", "2026-06-01T10:00:00Z", { totalGross: 10 });
    sale("o2", "2026-06-02T10:00:00Z", { totalGross: 5 });

    const report = getReport("2026-06-01", "2026-06-02");
    expect(report.orderCount).toBe(2);
    expect(report.totalGross).toBe(15);
    expect(report.from).toBe("2026-06-01");
    expect(report.to).toBe("2026-06-02");
  });

  it("cancellation counts at the original booking time", () => {
    sale("o1", "2026-06-01T10:00:00Z", { totalGross: 10 });
    cancel("c1", "o1", "2026-06-05T10:00:00Z");

    const day1 = getReport("2026-06-01", "2026-06-01");
    expect(day1.orderCount).toBe(0);
    expect(day1.cancelledCount).toBe(1);
    expect(day1.totalGross).toBe(0);
    expect(getReport("2026-06-05", "2026-06-05").cancelledCount).toBe(0);

    const list = listTransactions({ from: "2026-06-01", to: "2026-06-01" });
    expect(list.map((t) => t.orderId).sort()).toEqual(["c1", "o1"]);
    expect(list.every((t) => t.status === "cancelled")).toBe(true);
    expect(list.find((t) => t.orderId === "c1")!.closedAt).toBe(
      "2026-06-01T10:00:00.000Z",
    );
    expect(
      listTransactions({ from: "2026-06-05", to: "2026-06-05" }),
    ).toHaveLength(0);
  });

  it("discarded open order is not a sale", () => {
    sale("o1", "2026-06-01T10:00:00Z", { totalGross: 3, cancelled: true });

    expect(getReport("2026-06-01", "2026-06-01").orderCount).toBe(0);
    expect(listTransactions({ from: "2026-06-01", to: "2026-06-01" })).toEqual(
      [],
    );
  });

  it("vat by rate and by terminal", () => {
    sale("o1", "2026-06-01T10:00:00Z", {
      terminalId: "t1",
      items: [
        {
          itemId: "i1",
          name: "Espresso",
          qty: 2,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: 0.8,
          total: 5.0,
        },
      ],
      totalGross: 5.0,
      totalVat: { 19: 0.8 },
      totalNet: 4.2,
    });
    sale("o2", "2026-06-01T11:00:00Z", {
      terminalId: "t2",
      items: [
        {
          itemId: "i2",
          name: "Cake",
          qty: 1,
          unitPrice: 3.0,
          vatRate: 7,
          vatAmount: 0.2,
          total: 3.0,
        },
      ],
      totalGross: 3.0,
      totalVat: { 7: 0.2 },
      totalNet: 2.8,
    });

    const r = getReport("2026-06-01", "2026-06-01");
    expect(r.orderCount).toBe(2);
    expect(r.totalGross).toBe(8);
    expect(r.totalVat).toBe(1);
    expect(r.totalNet).toBe(7);
    expect(r.vatByGroup["19"].rate).toBe(19);
    expect(r.vatByGroup["19"].gross).toBe(5);
    expect(r.vatByGroup["19"].vat).toBe(0.8);
    expect(r.vatByGroup["7"].gross).toBe(3);
    expect(r.byTerminal["t1"]).toEqual({ orderCount: 1, total: 5.0 });
    expect(r.byTerminal["t2"]).toEqual({ orderCount: 1, total: 3.0 });
    expect(r.topItems).toEqual([
      { itemId: "i1", name: "Espresso", count: 2 },
      { itemId: "i2", name: "Cake", count: 1 },
    ]);
  });

  it("rounds money sums to cents", () => {
    for (const [id, gross] of [
      ["o1", 0.1],
      ["o2", 0.2],
    ] as const) {
      sale(id, "2026-06-01T10:00:00Z", {
        items: [
          {
            itemId: "i1",
            name: "X",
            qty: 1,
            unitPrice: gross,
            vatRate: 19,
            vatAmount: gross,
            total: gross,
          },
        ],
        totalGross: gross,
        totalVat: { 19: gross },
        totalNet: gross,
      });
    }
    const r = getReport("2026-06-01", "2026-06-01");
    expect(r.totalGross).toBe(0.3);
    expect(r.totalVat).toBe(0.3);
    expect(r.totalNet).toBe(0.3);
    expect(r.vatByGroup["19"].gross).toBe(0.3);
    expect(r.vatByGroup["19"].vat).toBe(0.3);
    expect(r.byTerminal["t1"].total).toBe(0.3);
  });

  it("filters and sorts transactions", () => {
    sale("o1", "2026-06-01T10:00:00Z", {
      terminalId: "t1",
      items: [espresso(1)],
      totalGross: 2.5,
    });
    sale("o2", "2026-06-02T10:00:00Z", { terminalId: "t2", totalGross: 1 });

    const all = listTransactions({ from: "2026-06-01", to: "2026-06-02" });
    expect(all.map((t) => t.orderId)).toEqual(["o2", "o1"]);
    expect(
      listTransactions({
        from: "2026-06-01",
        to: "2026-06-02",
        terminal: "t1",
      }).map((t) => t.orderId),
    ).toEqual(["o1"]);
    expect(
      listTransactions({
        from: "2026-06-01",
        to: "2026-06-02",
        search: "espresso",
      }).map((t) => t.orderId),
    ).toEqual(["o1"]);
    expect(
      listTransactions({
        from: "2026-06-01",
        to: "2026-06-02",
        status: "cancelled",
      }),
    ).toEqual([]);
  });

  describe("routes", () => {
    const app = express();
    app.use("/api/reporting", reportingRoutes);
    const pin = { "x-admin-pin": "0000" };

    it("GET /api/reporting/summary without from returns 400", async () => {
      const res = await request(app)
        .get("/api/reporting/summary?to=2026-06-01")
        .set(pin);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Zeitraum ungültig");
    });

    it("rejects impossible dates and reversed ranges", async () => {
      for (const q of [
        "from=2026-02-30&to=2026-03-01",
        "from=2026-06-02&to=2026-06-01",
        "from=abc&to=2026-06-01",
      ]) {
        const res = await request(app)
          .get(`/api/reporting/transactions?${q}`)
          .set(pin);
        expect(res.status).toBe(400);
      }
    });

    it("ignores repeated query params instead of failing", async () => {
      sale("o1", "2026-06-01T10:00:00Z", { totalGross: 10 });
      const res = await request(app)
        .get(
          "/api/reporting/transactions?from=2026-06-01&to=2026-06-01&search=a&search=b&terminal=x&terminal=y&status=closed&status=closed",
        )
        .set(pin);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("returns the report for a valid range", async () => {
      sale("o1", "2026-06-01T10:00:00Z", { totalGross: 10 });
      const res = await request(app)
        .get("/api/reporting/summary?from=2026-06-01&to=2026-06-01")
        .set(pin);
      expect(res.status).toBe(200);
      expect(res.body.totalGross).toBe(10);
    });
  });
});
