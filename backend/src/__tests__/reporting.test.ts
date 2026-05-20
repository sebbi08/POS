import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { orders, initOrderProjections } from "../modules/orders/orders.projections";
import {
  transactionHistory,
  dailyReport,
  itemCounts,
  initReportingProjections,
  getDailyReport,
} from "../modules/reporting/reporting.projections";
import { registerProjection } from "../projections/runner";

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
    orderHandler = orderMock.find(c => c[0] === "orders")![2];
    initReportingProjections();
    const reportMock = vi.mocked(registerProjection).mock.calls;
    reportHandler = reportMock.find(c => c[0] === "reporting")![2];
  });

  function givenAnOrder(id: string, terminalId: string, items: Array<{ itemId: string; name: string; qty: number; unitPrice: number; vatRate: number; vatAmount: number; total: number }>, totalGross: number, totalVat: Record<number, number>, totalNet: number) {
    orderHandler({ type: "OrderOpened", data: { id, terminalId } }, `order-${id}`);
    for (const item of items) {
      orderHandler({ type: "ItemAdded", data: { orderId: id, ...item } }, `order-${id}`);
      reportHandler({ type: "ItemAdded", data: { orderId: id, ...item } }, `order-${id}`);
    }
    orderHandler({ type: "OrderClosed", data: { orderId: id, totalGross, totalVat, totalNet } }, `order-${id}`);
  }

  it("adds order to transactionHistory on OrderClosed", () => {
    givenAnOrder("o1", "t1", [], 0, {}, 0);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 0, totalVat: {}, totalNet: 0 } }, "order-o1");

    const tx = transactionHistory.find(t => t.orderId === "o1");
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe("closed");
  });

  it("accumulates daily totals on OrderClosed", () => {
    givenAnOrder("o1", "t1", [
      { itemId: "i1", name: "Espresso", qty: 2, unitPrice: 2.50, vatRate: 19, vatAmount: 0.80, total: 5.00 },
    ], 5.00, { 19: 0.80 }, 4.20);

    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 5.00, totalVat: { 19: 0.80 }, totalNet: 4.20 } }, "order-o1");

    expect(dailyReport.orderCount).toBe(1);
    expect(dailyReport.totalGross).toBeCloseTo(5.00);
    expect(dailyReport.totalVat).toBeCloseTo(0.80);
    expect(dailyReport.totalNet).toBeCloseTo(4.20);
    expect(dailyReport.vatByGroup["19"].rate).toBe(19);
    expect(dailyReport.vatByGroup["19"].gross).toBeCloseTo(5.00);
    expect(dailyReport.vatByGroup["19"].vat).toBeCloseTo(0.80);
    expect(dailyReport.byTerminal["t1"].orderCount).toBe(1);
    expect(dailyReport.byTerminal["t1"].total).toBeCloseTo(5.00);
  });

  it("accumulates multiple orders", () => {
    givenAnOrder("o1", "t1", [
      { itemId: "i1", name: "Espresso", qty: 1, unitPrice: 2.50, vatRate: 19, vatAmount: 0.40, total: 2.50 },
    ], 2.50, { 19: 0.40 }, 2.10);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 2.50, totalVat: { 19: 0.40 }, totalNet: 2.10 } }, "order-o1");

    givenAnOrder("o2", "t2", [
      { itemId: "i2", name: "Cake", qty: 1, unitPrice: 3.00, vatRate: 7, vatAmount: 0.20, total: 3.00 },
    ], 3.00, { 7: 0.20 }, 2.80);
    reportHandler({ type: "OrderClosed", data: { orderId: "o2", totalGross: 3.00, totalVat: { 7: 0.20 }, totalNet: 2.80 } }, "order-o2");

    expect(dailyReport.orderCount).toBe(2);
    expect(dailyReport.totalGross).toBeCloseTo(5.50);
    expect(dailyReport.totalVat).toBeCloseTo(0.60);
    expect(dailyReport.totalNet).toBeCloseTo(4.90);
    expect(dailyReport.vatByGroup["19"].gross).toBeCloseTo(2.50);
    expect(dailyReport.vatByGroup["7"].gross).toBeCloseTo(3.00);
    expect(dailyReport.byTerminal["t1"].orderCount).toBe(1);
    expect(dailyReport.byTerminal["t2"].orderCount).toBe(1);
  });

  it("sets status to cancelled for OrderClosed with cancelled flag", () => {
    givenAnOrder("o1", "t1", [], 0, {}, 0);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 0, totalVat: {}, totalNet: 0, cancelled: true } }, "order-o1");

    const tx = transactionHistory.find(t => t.orderId === "o1");
    expect(tx!.status).toBe("cancelled");
    expect(dailyReport.orderCount).toBe(0);
    expect(dailyReport.totalGross).toBe(0);
  });

  it("does not accumulate totals for cancelled OrderClosed", () => {
    givenAnOrder("o1", "t1", [
      { itemId: "i1", name: "Espresso", qty: 1, unitPrice: 2.50, vatRate: 19, vatAmount: 0.40, total: 2.50 },
    ], 2.50, { 19: 0.40 }, 2.10);

    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 2.50, totalVat: { 19: 0.40 }, totalNet: 2.10, cancelled: true } }, "order-o1");

    expect(dailyReport.orderCount).toBe(0);
    expect(dailyReport.totalGross).toBe(0);
    expect(dailyReport.totalVat).toBe(0);
    expect(dailyReport.totalNet).toBe(0);
    expect(dailyReport.vatByGroup["19"]).toBeUndefined();
    expect(dailyReport.byTerminal["t1"]).toBeUndefined();
  });

  it("creates cancellation transaction entry", () => {
    givenAnOrder("o1", "t1", [], 0, {}, 0);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 0, totalVat: {}, totalNet: 0 } }, "order-o1");

    orderHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { 19: -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");
    reportHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { 19: -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

    const tx = transactionHistory.find(t => t.orderId === "c1");
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe("cancelled");
    expect(tx!.cancelsOrderId).toBe("o1");
  });

  it("updates original transaction status to cancelled on OrderCancellationCreated", () => {
    givenAnOrder("o1", "t1", [
      { itemId: "i1", name: "Espresso", qty: 1, unitPrice: 2.50, vatRate: 19, vatAmount: 0.40, total: 2.50 },
    ], 2.50, { 19: 0.40 }, 2.10);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 2.50, totalVat: { 19: 0.40 }, totalNet: 2.10 } }, "order-o1");

    expect(transactionHistory.find(t => t.orderId === "o1")!.status).toBe("closed");

    orderHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { 19: -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");
    reportHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { 19: -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

    expect(transactionHistory.find(t => t.orderId === "o1")!.status).toBe("cancelled");
  });

  it("reverses daily report totals on cancellation of closed order", () => {
    givenAnOrder("o1", "t1", [
      { itemId: "i1", name: "Espresso", qty: 2, unitPrice: 2.50, vatRate: 19, vatAmount: 0.80, total: 5.00 },
    ], 5.00, { 19: 0.80 }, 4.20);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 5.00, totalVat: { 19: 0.80 }, totalNet: 4.20 } }, "order-o1");

    expect(dailyReport.orderCount).toBe(1);
    expect(dailyReport.totalGross).toBeCloseTo(5.00);

    orderHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -2, unitPrice: 2.50, vatRate: 19, vatAmount: -0.80, total: -5.00 }],
        totalGross: -5.00, totalVat: { 19: -0.80 }, totalNet: -4.20,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");
    reportHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -2, unitPrice: 2.50, vatRate: 19, vatAmount: -0.80, total: -5.00 }],
        totalGross: -5.00, totalVat: { 19: -0.80 }, totalNet: -4.20,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

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
    givenAnOrder("o1", "t1", [
      { itemId: "i1", name: "Espresso", qty: 3, unitPrice: 2.50, vatRate: 19, vatAmount: 1.20, total: 7.50 },
    ], 7.50, { 19: 1.20 }, 6.30);
    reportHandler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 7.50, totalVat: { 19: 1.20 }, totalNet: 6.30 } }, "order-o1");

    orderHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -3, unitPrice: 2.50, vatRate: 19, vatAmount: -1.20, total: -7.50 }],
        totalGross: -7.50, totalVat: { 19: -1.20 }, totalNet: -6.30,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");
    reportHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -3, unitPrice: 2.50, vatRate: 19, vatAmount: -1.20, total: -7.50 }],
        totalGross: -7.50, totalVat: { 19: -1.20 }, totalNet: -6.30,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

    const report = getDailyReport();
    expect(report.topItems).toHaveLength(0);
  });

  it("ItemAdded skips items for cancellation orders", () => {
    orderHandler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancel",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { 19: -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

    reportHandler({ type: "ItemAdded", data: { orderId: "c1", itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 } }, "order-c1");

    const report = getDailyReport();
    expect(report.topItems).toHaveLength(0);
  });
});
