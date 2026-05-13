import { getClient } from "../eventstore/client";

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
  const client = getClient();

  for (const sub of subscriptions) {
    // Subscribe to all events, filter by prefix
    const subscription = client.subscribeToAll({ fromPosition: "start" });

    (async () => {
      for await (const resolved of subscription) {
        const e = resolved.event;
        if (e && e.streamId.startsWith(`${sub.prefix}-`)) {
          await sub.handler(
            { type: e.type, data: e.data as Record<string, unknown> },
            e.streamId
          );
        }
      }
    })();
  }

  console.log(
    `Projections started: ${subscriptions.map((s) => s.name).join(", ")}`
  );
}
