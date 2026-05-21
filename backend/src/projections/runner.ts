import {
  replayOrderEvents,
  subscribeToOrderEvents,
} from "../modules/orders/order-eventstore.js";

type EventHandler = (
  event: { type: string; data: Record<string, unknown> },
  streamName: string,
) => void | Promise<void>;

interface Subscription {
  name: string;
  prefix: string;
  handler: EventHandler;
}

const subscriptions: Subscription[] = [];

export function registerProjection(
  name: string,
  streamPrefix: string,
  handler: EventHandler,
): void {
  subscriptions.push({ name, prefix: streamPrefix, handler });
}

export async function startProjections(): Promise<void> {
  if (subscriptions.length === 0) {
    console.log("[backend:projections] No projections registered.");
    return;
  }

  console.log(
    `[backend:projections] Replaying order events for ${subscriptions.length} projection(s): ${subscriptions.map((s) => s.name).join(", ")}…`,
  );
  let eventCount = 0;
  const t0 = Date.now();
  await replayOrderEvents(async (event) => {
    eventCount++;
    const { streamId } = event;
    for (const sub of subscriptions) {
      if (streamId.startsWith(`${sub.prefix}-`)) {
        await sub.handler(event, streamId);
      }
    }
  });

  console.log(
    `[backend:projections]  Replayed ${eventCount} events in ${Date.now() - t0}ms`,
  );

  subscribeToOrderEvents((event) => {
    const { streamId } = event;
    for (const sub of subscriptions) {
      if (streamId.startsWith(`${sub.prefix}-`)) {
        sub.handler(event, streamId);
      }
    }
  });
}
