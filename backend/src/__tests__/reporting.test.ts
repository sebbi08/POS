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

import {
  initOrderProjections,
  orders,
} from "../modules/orders/orders.projections.js";
import {
  dailyReport,
  getDailyReport,
  initReportingProjections,
  itemCounts,
  transactionHistory,
} from "../modules/reporting/reporting.projections.js";
import { registerProjection } from "../projections/runner.js";

describe("Reporting Projections", () => {
  let orderHandler: (event: any, streamId: string) => void;
  let reportHandler: (event: any, streamId: string) => void;

  function reset() {
    orders.clear();
    transactionHistory.length = 0;
    itemCounts.clear();
    dailyReport.orderCount = 0;
    dailyReport.cancelledCount = 0;
    dailyReport.totalGross = 0;
    dailyReport.totalVat = 0;
    dailyReport.totalNet = 0;
    dailyReport.vatByGroup = {};
    dailyReport.byTerminal = {};
  }

  beforeEach(() => {
    vi.clearAllMocks();
    reset();
    initOrderProjections();
    const orderMock = vi.mocked(registerProjection).mock.calls;
    orderHandler = orderMock.find((c) => c[0] === "orders")![2];
    initReportingProjections();
    const reportMock = vi.mocked(registerProjection).mock.calls;
    reportHandler = reportMock.find((c) => c[0] === "reporting")![2];
  });

  function givenAnOrder(
    id: string,
    terminalId: string,
    items: Array<{
      itemId: string;
      name: string;
      qty: number;
      unitPrice: number;
      vatRate: number;
      vatAmount: number;
      total: number;
    }>,
    totalGross: number,
    totalVat: Record<number, number>,
    totalNet: number,
  ) {
    orderHandler(
      { type: "OrderOpened", data: { id, terminalId } },
      `order-${id}`,
    );
    for (const item of items) {
      orderHandler(
        { type: "ItemAdded", data: { orderId: id, ...item } },
        `order-${id}`,
      );
      reportHandler(
        { type: "ItemAdded", data: { orderId: id, ...item } },
        `order-${id}`,
      );
    }
    orderHandler(
      {
        type: "OrderClosed",
        data: { orderId: id, totalGross, totalVat, totalNet },
      },
      `order-${id}`,
    );
  }

  it("adds order to transactionHistory on OrderClosed", () => {
    givenAnOrder("o1", "t1", [], 0, {}, 0);
    reportHandler(
      {
        type: "OrderClosed",
        data: { orderId: "o1", totalGross: 0, totalVat: {}, totalNet: 0 },
      },
      "order-o1",
    );

    const tx = transactionHistory.find((t) => t.orderId === "o1");
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe("closed");
  });

  it("accumulates daily totals on OrderClosed", () => {
    givenAnOrder(
      "o1",
      "t1",
      [
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
      5.0,
      { 19: 0.8 },
      4.2,
    );

    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 5.0,
          totalVat: { 19: 0.8 },
          totalNet: 4.2,
        },
      },
      "order-o1",
    );

    expect(dailyReport.orderCount).toBe(1);
    expect(dailyReport.totalGross).toBeCloseTo(5.0);
    expect(dailyReport.totalVat).toBeCloseTo(0.8);
    expect(dailyReport.totalNet).toBeCloseTo(4.2);
    expect(dailyReport.vatByGroup["19"].rate).toBe(19);
    expect(dailyReport.vatByGroup["19"].gross).toBeCloseTo(5.0);
    expect(dailyReport.vatByGroup["19"].vat).toBeCloseTo(0.8);
    expect(dailyReport.byTerminal["t1"].orderCount).toBe(1);
    expect(dailyReport.byTerminal["t1"].total).toBeCloseTo(5.0);
  });

  it("accumulates multiple orders", () => {
    givenAnOrder(
      "o1",
      "t1",
      [
        {
          itemId: "i1",
          name: "Espresso",
          qty: 1,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: 0.4,
          total: 2.5,
        },
      ],
      2.5,
      { 19: 0.4 },
      2.1,
    );
    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 2.5,
          totalVat: { 19: 0.4 },
          totalNet: 2.1,
        },
      },
      "order-o1",
    );

    givenAnOrder(
      "o2",
      "t2",
      [
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
      3.0,
      { 7: 0.2 },
      2.8,
    );
    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o2",
          totalGross: 3.0,
          totalVat: { 7: 0.2 },
          totalNet: 2.8,
        },
      },
      "order-o2",
    );

    expect(dailyReport.orderCount).toBe(2);
    expect(dailyReport.totalGross).toBeCloseTo(5.5);
    expect(dailyReport.totalVat).toBeCloseTo(0.6);
    expect(dailyReport.totalNet).toBeCloseTo(4.9);
    expect(dailyReport.vatByGroup["19"].gross).toBeCloseTo(2.5);
    expect(dailyReport.vatByGroup["7"].gross).toBeCloseTo(3.0);
    expect(dailyReport.byTerminal["t1"].orderCount).toBe(1);
    expect(dailyReport.byTerminal["t2"].orderCount).toBe(1);
  });

  it("sets status to cancelled for OrderClosed with cancelled flag", () => {
    givenAnOrder("o1", "t1", [], 0, {}, 0);
    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 0,
          totalVat: {},
          totalNet: 0,
          cancelled: true,
        },
      },
      "order-o1",
    );

    const tx = transactionHistory.find((t) => t.orderId === "o1");
    expect(tx!.status).toBe("cancelled");
    expect(dailyReport.orderCount).toBe(0);
    expect(dailyReport.totalGross).toBe(0);
  });

  it("does not accumulate totals for cancelled OrderClosed", () => {
    givenAnOrder(
      "o1",
      "t1",
      [
        {
          itemId: "i1",
          name: "Espresso",
          qty: 1,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: 0.4,
          total: 2.5,
        },
      ],
      2.5,
      { 19: 0.4 },
      2.1,
    );

    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 2.5,
          totalVat: { 19: 0.4 },
          totalNet: 2.1,
          cancelled: true,
        },
      },
      "order-o1",
    );

    expect(dailyReport.orderCount).toBe(0);
    expect(dailyReport.totalGross).toBe(0);
    expect(dailyReport.totalVat).toBe(0);
    expect(dailyReport.totalNet).toBe(0);
    expect(dailyReport.vatByGroup["19"]).toBeUndefined();
    expect(dailyReport.byTerminal["t1"]).toBeUndefined();
  });

  it("creates cancellation transaction entry", () => {
    givenAnOrder("o1", "t1", [], 0, {}, 0);
    reportHandler(
      {
        type: "OrderClosed",
        data: { orderId: "o1", totalGross: 0, totalVat: {}, totalNet: 0 },
      },
      "order-o1",
    );

    orderHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -1,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.4,
              total: -2.5,
            },
          ],
          totalGross: -2.5,
          totalVat: { 19: -0.4 },
          totalNet: -2.1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );
    reportHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -1,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.4,
              total: -2.5,
            },
          ],
          totalGross: -2.5,
          totalVat: { 19: -0.4 },
          totalNet: -2.1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );

    const tx = transactionHistory.find((t) => t.orderId === "c1");
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe("cancelled");
    expect(tx!.cancelsOrderId).toBe("o1");
  });

  it("updates original transaction status to cancelled on OrderCancellationCreated", () => {
    givenAnOrder(
      "o1",
      "t1",
      [
        {
          itemId: "i1",
          name: "Espresso",
          qty: 1,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: 0.4,
          total: 2.5,
        },
      ],
      2.5,
      { 19: 0.4 },
      2.1,
    );
    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 2.5,
          totalVat: { 19: 0.4 },
          totalNet: 2.1,
        },
      },
      "order-o1",
    );

    expect(transactionHistory.find((t) => t.orderId === "o1")!.status).toBe(
      "closed",
    );

    orderHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -1,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.4,
              total: -2.5,
            },
          ],
          totalGross: -2.5,
          totalVat: { 19: -0.4 },
          totalNet: -2.1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );
    reportHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -1,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.4,
              total: -2.5,
            },
          ],
          totalGross: -2.5,
          totalVat: { 19: -0.4 },
          totalNet: -2.1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );

    expect(transactionHistory.find((t) => t.orderId === "o1")!.status).toBe(
      "cancelled",
    );
  });

  it("reverses daily report totals on cancellation of closed order", () => {
    givenAnOrder(
      "o1",
      "t1",
      [
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
      5.0,
      { 19: 0.8 },
      4.2,
    );
    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 5.0,
          totalVat: { 19: 0.8 },
          totalNet: 4.2,
        },
      },
      "order-o1",
    );

    expect(dailyReport.orderCount).toBe(1);
    expect(dailyReport.totalGross).toBeCloseTo(5.0);

    orderHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -2,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.8,
              total: -5.0,
            },
          ],
          totalGross: -5.0,
          totalVat: { 19: -0.8 },
          totalNet: -4.2,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );
    reportHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -2,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.8,
              total: -5.0,
            },
          ],
          totalGross: -5.0,
          totalVat: { 19: -0.8 },
          totalNet: -4.2,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );

    expect(dailyReport.orderCount).toBe(0);
    expect(dailyReport.totalGross).toBeCloseTo(0);
    expect(dailyReport.totalVat).toBeCloseTo(0);
    expect(dailyReport.totalNet).toBeCloseTo(0);
    expect(dailyReport.cancelledCount).toBe(1);
    expect(dailyReport.vatByGroup["19"].gross).toBeCloseTo(0);
    expect(dailyReport.vatByGroup["19"].vat).toBeCloseTo(0);
    expect(dailyReport.byTerminal["t1"].orderCount).toBe(0);
    expect(dailyReport.byTerminal["t1"].total).toBeCloseTo(0);
  });

  it("reverses item counts on cancellation", () => {
    givenAnOrder(
      "o1",
      "t1",
      [
        {
          itemId: "i1",
          name: "Espresso",
          qty: 3,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: 1.2,
          total: 7.5,
        },
      ],
      7.5,
      { 19: 1.2 },
      6.3,
    );
    reportHandler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 7.5,
          totalVat: { 19: 1.2 },
          totalNet: 6.3,
        },
      },
      "order-o1",
    );

    orderHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -3,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -1.2,
              total: -7.5,
            },
          ],
          totalGross: -7.5,
          totalVat: { 19: -1.2 },
          totalNet: -6.3,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );
    reportHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -3,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -1.2,
              total: -7.5,
            },
          ],
          totalGross: -7.5,
          totalVat: { 19: -1.2 },
          totalNet: -6.3,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );

    const report = getDailyReport();
    expect(report.topItems).toHaveLength(0);
  });

  it("ItemAdded skips items for cancellation orders", () => {
    orderHandler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancel",
          cancelsOrderId: "o1",
          items: [
            {
              itemId: "i1",
              name: "Espresso",
              qty: -1,
              unitPrice: 2.5,
              vatRate: 19,
              vatAmount: -0.4,
              total: -2.5,
            },
          ],
          totalGross: -2.5,
          totalVat: { 19: -0.4 },
          totalNet: -2.1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );

    reportHandler(
      {
        type: "ItemAdded",
        data: {
          orderId: "c1",
          itemId: "i1",
          name: "Espresso",
          qty: -1,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: -0.4,
          total: -2.5,
        },
      },
      "order-c1",
    );

    const report = getDailyReport();
    expect(report.topItems).toHaveLength(0);
  });
});
