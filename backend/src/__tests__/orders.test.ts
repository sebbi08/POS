import { describe, it, expect, vi } from "vitest";

vi.mock("../eventstore/client", () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
  initEventStore: vi.fn().mockResolvedValue(undefined),
  readStream: vi.fn().mockResolvedValue([]),
  subscribeToAll: vi.fn(),
  replayAll: vi.fn().mockResolvedValue(undefined),
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [{ count: "0" }] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
    on: vi.fn(),
  }),
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

import { appendEvent } from "../eventstore/client";
import { openOrder, addItemToOrder, cancelOrder } from "../modules/orders/orders.commands";
import {
  orders,
  initOrderProjections,
  getOpenOrdersByTerminal,
} from "../modules/orders/orders.projections";
import { registerProjection } from "../projections/runner";

describe("Orders Commands", () => {
  it("opens an order with OrderOpened event", async () => {
    const id = await openOrder("terminal-1", "terminal-1");
    expect(id).toBeTruthy();
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.stringContaining("order-"),
      "OrderOpened",
      expect.objectContaining({ terminalId: "terminal-1" })
    );
  });

  it("throws when adding nonexistent item", async () => {
    await expect(addItemToOrder("o1", "nonexistent", 1)).rejects.toThrow("not found");
  });

  it("cancels an order with reason", async () => {
    await cancelOrder("o1", "Wrong order", "terminal-1");
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      "order-o1",
      "OrderCancelled",
      expect.objectContaining({ orderId: "o1", reason: "Wrong order", userId: "terminal-1" })
    );
  });
});

describe("Orders Projections", () => {
  it("processes full order lifecycle: open → add → pay → close", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "t1", userId: "t1" } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("open");

    handler({ type: "ItemAdded", data: { orderId: "o1", itemId: "i1", name: "Espresso", qty: 1, unitPrice: 2.50, vatRate: 19, vatAmount: 0.40, total: 2.50 } }, "order-o1");
    expect(orders.get("o1")!.items).toHaveLength(1);

    handler({ type: "OrderPaid", data: { orderId: "o1", totalGross: 2.50, totalVat: { "19": 0.40 }, totalNet: 2.10 } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("paid");
    expect(orders.get("o1")!.totalGross).toBe(2.50);

    handler({ type: "OrderClosed", data: { orderId: "o1" } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("closed");
  });

  it("handles cancelled orders", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "t1", userId: "t1" } }, "order-o1");
    handler({ type: "OrderCancelled", data: { orderId: "o1", reason: "Mistake", userId: "t1" } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("cancelled");
    expect(orders.get("o1")!.cancelledReason).toBe("Mistake");
  });

  it("getOpenOrdersByTerminal filters by terminal and status", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "bar", userId: "bar" } }, "order-o1");
    handler({ type: "OrderOpened", data: { id: "o2", terminalId: "kitchen", userId: "kitchen" } }, "order-o2");
    handler({ type: "OrderClosed", data: { orderId: "o2" } }, "order-o2");

    const barOrders = getOpenOrdersByTerminal("bar");
    expect(barOrders).toHaveLength(1);
    expect(barOrders[0].id).toBe("o1");
  });
});
