import { describe, it, expect, vi } from "vitest";

vi.mock("../modules/orders/order-eventstore", () => ({
  appendOrderEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    port: 3001,
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
    receiptPdfDir: "/tmp/test",
  },
}));

vi.mock("../projections/runner", () => ({
  registerProjection: vi.fn(),
  startProjections: vi.fn().mockResolvedValue(undefined),
}));

import { openOrder } from "../modules/orders/orders.commands";
import {
  orders,
  initOrderProjections,
  getOpenOrdersByTerminal,
} from "../modules/orders/orders.projections";
import { registerProjection } from "../projections/runner";
import { appendOrderEvent } from "../modules/orders/order-eventstore";

describe("Orders Commands", () => {
  it("opens an order with OrderOpened event", async () => {
    const id = await openOrder("terminal-1");
    expect(id).toBeTruthy();
    expect(vi.mocked(appendOrderEvent)).toHaveBeenCalledWith(
      expect.stringContaining("order-"),
      "OrderOpened",
      expect.objectContaining({ terminalId: "terminal-1" })
    );
  });
});

describe("Orders Projections", () => {
  it("processes full order lifecycle: open → add → close", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "t1" } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("open");

    handler({ type: "ItemAdded", data: { orderId: "o1", itemId: "i1", name: "Espresso", qty: 1, unitPrice: 2.50, vatRate: 19, vatAmount: 0.40, total: 2.50 } }, "order-o1");
    expect(orders.get("o1")!.items).toHaveLength(1);

    handler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 2.50, totalVat: { "19": 0.40 }, totalNet: 2.10 } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("closed");
    expect(orders.get("o1")!.totalGross).toBe(2.50);
  });

  it("OrderCancellationCreated creates cancellation order and links original", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "t1" } }, "order-o1");
    handler({ type: "OrderClosed", data: { orderId: "o1", totalGross: 2.50, totalVat: { "19": 0.40 }, totalNet: 2.10 } }, "order-o1");

    handler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancellation of order #o1",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { "19": -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

    const cancellation = orders.get("c1")!;
    expect(cancellation.status).toBe("closed");
    expect(cancellation.title).toBe("Cancellation of order #o1");
    expect(cancellation.cancelsOrderId).toBe("o1");
    expect(cancellation.totalGross).toBe(-2.50);

    const original = orders.get("o1")!;
    expect(original.cancelledByOrderId).toBe("c1");
  });

  it("getOpenOrdersByTerminal filters by terminal and status", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "bar" } }, "order-o1");
    handler({ type: "OrderOpened", data: { id: "o2", terminalId: "kitchen" } }, "order-o2");
    handler({ type: "OrderClosed", data: { orderId: "o2", totalGross: 0, totalVat: {}, totalNet: 0 } }, "order-o2");

    const barOrders = getOpenOrdersByTerminal("bar");
    expect(barOrders).toHaveLength(1);
    expect(barOrders[0].id).toBe("o1");
  });
});
