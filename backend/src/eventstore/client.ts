import {
  EventStoreDBClient,
  jsonEvent,
  StreamNotFoundError,
  AppendResult,
  JSONEventType,
} from "@eventstore/db-client";
import { config } from "../config";

let client: EventStoreDBClient;

export function getClient(): EventStoreDBClient {
  if (!client) {
    client = EventStoreDBClient.connectionString(config.esdb.connectionString);
  }
  return client;
}

export async function appendEvent<
  E extends JSONEventType = JSONEventType
>(
  streamName: string,
  eventType: string,
  data: E["data"]
): Promise<AppendResult> {
  const c = getClient();
  const event = jsonEvent({ type: eventType, data });
  return c.appendToStream(streamName, [event], {
    expectedRevision: "any",
  });
}

export async function appendEvents<
  E extends JSONEventType = JSONEventType
>(
  streamName: string,
  events: { type: string; data: E["data"] }[]
): Promise<AppendResult> {
  const c = getClient();
  const esdbEvents = events.map((e) =>
    jsonEvent({ type: e.type, data: e.data })
  );
  return c.appendToStream(streamName, esdbEvents, {
    expectedRevision: "any",
  });
}

export async function readStream<E = Record<string, unknown>>(
  streamName: string
): Promise<{ type: string; data: E; created: Date }[]> {
  const c = getClient();
  const events: { type: string; data: E; created: Date }[] = [];
  try {
    for await (const resolved of c.readStream(streamName)) {
      const e = resolved.event;
      if (e) {
        events.push({
          type: e.type,
          data: e.data as E,
          created: new Date(e.created),
        });
      }
    }
  } catch (err) {
    if (err instanceof StreamNotFoundError) {
      return [];
    }
    throw err;
  }
  return events;
}
