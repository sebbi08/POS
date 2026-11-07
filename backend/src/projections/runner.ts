import {
  replayOrderEvents,
  subscribeToOrderEvents,
  type StoredEvent,
} from "../modules/orders/order-eventstore.js";

type EventHandler = (
  event: StoredEvent,
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

async function dispatch(event: StoredEvent): Promise<void> {
  const { streamId } = event;
  for (const sub of subscriptions) {
    if (!streamId.startsWith(`${sub.prefix}-`)) continue;
    try {
      await sub.handler(event, streamId);
    } catch (err) {
      // Count the event as delivered so other projections never see it twice.
      console.error(
        `[backend:projections] ${sub.name} failed on event ${event.id}:`,
        err,
      );
    }
  }
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
  const lastId = await replayOrderEvents(async (event) => {
    eventCount++;
    await dispatch(event);
  });

  console.log(
    `[backend:projections]  Replayed ${eventCount} events in ${Date.now() - t0}ms`,
  );

  await subscribeToOrderEvents(lastId, dispatch);
}
