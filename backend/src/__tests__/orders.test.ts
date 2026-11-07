import { describe, expect, it, vi } from "vitest";

vi.mock("../modules/orders/order-eventstore", () => ({
  appendOrderEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi
      .fn()
      .mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    port: 3001,
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
  },
}));

vi.mock("../projections/runner", () => ({
  registerProjection: vi.fn(),
  startProjections: vi.fn().mockResolvedValue(undefined),
}));

import { type StoredEvent } from "../modules/orders/order-eventstore.js";
import {
  getOpenOrdersByTerminal,
  initOrderProjections,
  orders,
} from "../modules/orders/orders.projections.js";
import { registerProjection } from "../projections/runner.js";

describe("Orders Projections", () => {
  it("processes full order lifecycle: open → add → close", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2] as (
      e: Partial<StoredEvent>,
      streamName: string,
    ) => void | Promise<void>;

    handler(
      { type: "OrderOpened", data: { id: "o1", terminalId: "t1" } },
      "order-o1",
    );
    expect(orders.get("o1")!.status).toBe("open");

    handler(
      {
        type: "ItemAdded",
        data: {
          orderId: "o1",
          itemId: "i1",
          name: "Espresso",
          qty: 1,
          unitPrice: 2.5,
          vatRate: 19,
          vatAmount: 0.4,
          total: 2.5,
        },
      },
      "order-o1",
    );
    expect(orders.get("o1")!.items).toHaveLength(1);

    handler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 2.5,
          totalVat: { "19": 0.4 },
          totalNet: 2.1,
        },
      },
      "order-o1",
    );
    expect(orders.get("o1")!.status).toBe("closed");
    expect(orders.get("o1")!.totalGross).toBe(2.5);
  });

  it("OrderCancellationCreated creates cancellation order and links original", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2] as (
      e: Partial<StoredEvent>,
      streamName: string,
    ) => void | Promise<void>;

    handler(
      { type: "OrderOpened", data: { id: "o1", terminalId: "t1" } },
      "order-o1",
    );
    handler(
      {
        type: "OrderClosed",
        data: {
          orderId: "o1",
          totalGross: 2.5,
          totalVat: { "19": 0.4 },
          totalNet: 2.1,
        },
      },
      "order-o1",
    );

    handler(
      {
        type: "OrderCancellationCreated",
        data: {
          id: "c1",
          terminalId: "t1",
          title: "Cancellation of order #o1",
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
          totalVat: { "19": -0.4 },
          totalNet: -2.1,
          createdAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
        },
      },
      "order-c1",
    );

    const cancellation = orders.get("c1")!;
    expect(cancellation.status).toBe("closed");
    expect(cancellation.title).toBe("Cancellation of order #o1");
    expect(cancellation.cancelsOrderId).toBe("o1");
    expect(cancellation.totalGross).toBe(-2.5);

    const original = orders.get("o1")!;
    expect(original.cancelledByOrderId).toBe("c1");
  });

  it("OrderOpened sets createdAt and OrderClosed sets closedAt from occurredAt", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2] as (
      e: Partial<StoredEvent>,
      streamName: string,
    ) => void | Promise<void>;

    handler(
      {
        type: "OrderOpened",
        data: { id: "o1", terminalId: "t1" },
        occurredAt: new Date("2026-06-01T20:00:00Z"),
      },
      "order-o1",
    );
    expect(orders.get("o1")!.createdAt.toISOString()).toBe(
      "2026-06-01T20:00:00.000Z",
    );
    handler(
      {
        type: "OrderClosed",
        data: { orderId: "o1", totalGross: 0, totalVat: {}, totalNet: 0 },
        occurredAt: new Date("2026-06-01T20:15:00Z"),
      },
      "order-o1",
    );
    expect(orders.get("o1")!.closedAt?.toISOString()).toBe(
      "2026-06-01T20:15:00.000Z",
    );
  });

  it("getOpenOrdersByTerminal filters by terminal and status", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2] as (
      e: Partial<StoredEvent>,
      streamName: string,
    ) => void | Promise<void>;

    handler(
      { type: "OrderOpened", data: { id: "o1", terminalId: "bar" } },
      "order-o1",
    );
    handler(
      { type: "OrderOpened", data: { id: "o2", terminalId: "kitchen" } },
      "order-o2",
    );
    handler(
      {
        type: "OrderClosed",
        data: { orderId: "o2", totalGross: 0, totalVat: {}, totalNet: 0 },
      },
      "order-o2",
    );

    const barOrders = getOpenOrdersByTerminal("bar");
    expect(barOrders).toHaveLength(1);
    expect(barOrders[0].id).toBe("o1");
  });
});

describe("cancelOrder", () => {
  it("uses the German default title when no reason is given", async () => {
    const { cancelOrder } = await import("../modules/orders/orders.commands.js");
    const { appendOrderEvent } = await import("../modules/orders/order-eventstore.js");
    orders.clear();
    orders.set("12345678-aaaa", {
      id: "12345678-aaaa", terminalId: "t1", status: "closed", items: [],
      totalGross: 0, totalVat: {}, totalNet: 0,
    } as never);
    await cancelOrder("12345678-aaaa", "t1");
    const data = vi.mocked(appendOrderEvent).mock.calls.at(-1)![2] as { title: string };
    expect(data.title).toBe("Storno zu Bestellung #12345678");
  });
});
