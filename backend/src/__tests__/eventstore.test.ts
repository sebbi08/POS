import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();
const clientQuery = vi.fn().mockResolvedValue({ rows: [] });
const clientOn = vi.fn();

vi.mock("../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => poolQuery(...args),
    connect: vi.fn().mockResolvedValue({
      query: (...args: unknown[]) => clientQuery(...args),
      release: vi.fn(),
      on: (...args: unknown[]) => clientOn(...args),
    }),
  }),
}));

import {
  appendOrderEvent,
  insertOrderEvents,
  replayOrderEvents,
  subscribeToOrderEvents,
} from "../modules/orders/order-eventstore.js";

const row = (id: number) => ({
  id: String(id),
  stream_id: `order-o${id}`,
  event_type: "OrderOpened",
  data: { id: `o${id}` },
  created_at: new Date("2026-06-01T20:15:00Z"),
});

describe("order event store", () => {
  beforeEach(() => {
    poolQuery.mockReset();
    clientOn.mockReset();
    clientQuery.mockClear();
  });

  it("subscriber delivers every event inserted since the last seen id", async () => {
    const handler = vi.fn();
    poolQuery.mockResolvedValueOnce({ rows: [] }); // catch-up fetch
    await subscribeToOrderEvents(4, handler);
    await vi.waitFor(() => expect(poolQuery).toHaveBeenCalledTimes(1));
    poolQuery.mockClear();
    const onNotification = clientOn.mock.calls.find(
      (c) => c[0] === "notification",
    )![1] as () => void;

    poolQuery.mockResolvedValueOnce({ rows: [row(5), row(6), row(7)] });
    onNotification();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(3));
    expect(handler.mock.calls.map((c) => c[0].id)).toEqual([5, 6, 7]);
    expect(handler.mock.calls[0][0].occurredAt.toISOString()).toBe(
      "2026-06-01T20:15:00.000Z",
    );
    expect(poolQuery.mock.calls[0][1]).toEqual([4]);

    poolQuery.mockResolvedValueOnce({ rows: [] });
    onNotification();
    await vi.waitFor(() => expect(poolQuery).toHaveBeenCalledTimes(2));
    expect(poolQuery.mock.calls[1][1]).toEqual([7]);
  });

  it("replay returns highest id", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [row(5), row(6), row(7)] });
    const handler = vi.fn().mockResolvedValue(undefined);
    expect(await replayOrderEvents(handler)).toBe(7);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("replay returns 0 for an empty table", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await replayOrderEvents(vi.fn())).toBe(0);
  });

  it("catch-up fetch happens after LISTEN without any notification", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [row(9)] });
    const handler = vi.fn();
    await subscribeToOrderEvents(8, handler);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(poolQuery.mock.calls[0][1]).toEqual([8]);
    expect(clientQuery.mock.calls.map((c) => c[0])).toContain(
      'LISTEN "order_events"',
    );
  });

  it("appendOrderEvent runs BEGIN, advisory lock, INSERT, COMMIT in order", async () => {
    await appendOrderEvent("order-o1", "OrderOpened", { id: "o1" });
    const sql = clientQuery.mock.calls.map((c) => String(c[0]));
    const idx = ["BEGIN", "pg_advisory_xact_lock", "INSERT", "COMMIT"].map(
      (k) => sql.findIndex((q) => q.includes(k)),
    );
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("insertOrderEvents takes the lock before INSERT and passes occurredAt", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const at = new Date("2026-06-01T20:15:00Z");
    await insertOrderEvents(client as never, "order-o1", [
      { type: "OrderOpened", data: { id: "o1" }, occurredAt: at },
    ]);
    const sql = client.query.mock.calls.map((c) => String(c[0]));
    expect(sql.findIndex((q) => q.includes("pg_advisory_xact_lock"))).toBe(0);
    const insert = client.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT"),
    )!;
    expect(insert[1][3]).toBe(at);
  });
});
