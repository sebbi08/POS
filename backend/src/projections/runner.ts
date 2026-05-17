import { replayOrderEvents, subscribeToOrderEvents } from "../modules/orders/order-eventstore";

type EventHandler = (
  event: { type: string; data: Record<string, unknown> },
  streamName: string
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
  handler: EventHandler
): void {
  subscriptions.push({ name, prefix: streamPrefix, handler });
}

export async function startProjections(): Promise<void> {
  if (subscriptions.length === 0) {
    console.log("No projections registered.");
    return;
  }

  console.log("Replaying order events...");
  await replayOrderEvents(async (event) => {
    const { streamId } = event;
    for (const sub of subscriptions) {
      if (streamId.startsWith(`${sub.prefix}-`)) {
        await sub.handler(event, streamId);
      }
    }
  });

  console.log(
    `Projections started: ${subscriptions.map((s) => s.name).join(", ")}`
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
