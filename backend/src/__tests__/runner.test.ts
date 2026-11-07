import { describe, expect, it, vi } from "vitest";

let subscribed: ((e: unknown) => Promise<void>) | undefined;

vi.mock("../modules/orders/order-eventstore", () => ({
  replayOrderEvents: vi.fn().mockResolvedValue(7),
  subscribeToOrderEvents: vi.fn(
    async (_from: number, h: (e: unknown) => Promise<void>) => {
      subscribed = h;
    },
  ),
}));

import { subscribeToOrderEvents } from "../modules/orders/order-eventstore.js";
import { registerProjection, startProjections } from "../projections/runner.js";

describe("projection runner", () => {
  it("a throwing projection does not stop another one from receiving the event", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("boom"));
    const good = vi.fn();
    registerProjection("bad", "order", bad);
    registerProjection("good", "order", good);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await startProjections();
    expect(vi.mocked(subscribeToOrderEvents).mock.calls[0][0]).toBe(7);

    const event = {
      id: 8,
      type: "OrderOpened",
      data: {},
      streamId: "order-o1",
      occurredAt: new Date(),
    };
    await expect(subscribed!(event)).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledWith(event, "order-o1");
    expect(console.error).toHaveBeenCalled();
  });
});
