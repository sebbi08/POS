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
  });

  it("subscriber delivers every event inserted since the last seen id", async () => {
    const handler = vi.fn();
    await subscribeToOrderEvents(4, handler);
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
});
