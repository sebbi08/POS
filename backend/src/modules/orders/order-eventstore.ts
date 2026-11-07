import type { PoolClient } from "pg";
import { getPool } from "../../db.js";

let tableInitialized = false;

export type StoredEvent = {
  id: number;
  type: string;
  data: Record<string, unknown>;
  streamId: string;
  occurredAt: Date;
};

async function initOrderEventsTable(): Promise<void> {
  if (tableInitialized) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_events (
        id BIGSERIAL PRIMARY KEY,
        stream_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_order_events_stream ON order_events(stream_id, created_at);
    `);
    tableInitialized = true;
  } finally {
    client.release();
  }
}

export async function appendOrderEvent(
  streamId: string,
  eventType: string,
  data: Record<string, unknown>,
  occurredAt?: Date,
): Promise<void> {
  await initOrderEventsTable();
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO order_events (stream_id, event_type, data, created_at) VALUES ($1, $2, $3, COALESCE($4, NOW()))`,
      [streamId, eventType, JSON.stringify(data), occurredAt ?? null],
    );
    await client.query(`NOTIFY "${streamId}", '1'`);
    await client.query(`NOTIFY "order_events", '1'`);
  } finally {
    client.release();
  }
}

/**
 * Inserts events inside a transaction held by the caller. Postgres delivers
 * the NOTIFY only when that transaction commits.
 */
export async function insertOrderEvents(
  client: PoolClient,
  streamId: string,
  events: { type: string; data: Record<string, unknown>; occurredAt: Date }[],
): Promise<void> {
  await initOrderEventsTable();
  for (const e of events) {
    await client.query(
      `INSERT INTO order_events (stream_id, event_type, data, created_at) VALUES ($1, $2, $3, $4)`,
      [streamId, e.type, JSON.stringify(e.data), e.occurredAt],
    );
  }
  await client.query(`NOTIFY "${streamId}", '1'`);
  await client.query(`NOTIFY "order_events", '1'`);
}

export async function readOrderStream<E = Record<string, unknown>>(
  streamId: string,
): Promise<{ type: string; data: E; created: Date }[]> {
  await initOrderEventsTable();
  const result = await getPool().query(
    `SELECT event_type, data, created_at FROM order_events WHERE stream_id = $1 ORDER BY id ASC`,
    [streamId],
  );
  return result.rows.map((row) => ({
    type: row.event_type,
    data: row.data as E,
    created: new Date(row.created_at),
  }));
}

function toStoredEvent(row: {
  id: string | number;
  stream_id: string;
  event_type: string;
  data: Record<string, unknown>;
  created_at: Date | string;
}): StoredEvent {
  return {
    id: Number(row.id),
    type: row.event_type,
    data: row.data,
    streamId: row.stream_id,
    occurredAt: new Date(row.created_at),
  };
}

const EVENT_COLUMNS = `id, stream_id, event_type, data, created_at`;

export async function subscribeToOrderEvents(
  fromId: number,
  handler: (event: StoredEvent) => void | Promise<void>,
): Promise<() => void> {
  await initOrderEventsTable();
  const client = await getPool().connect();
  await client.query('LISTEN "order_events"');

  let lastId = fromId;
  // Serialize fetches so two notifications can never overtake each other.
  let chain: Promise<void> = Promise.resolve();

  const cleanup = () => {
    client.release();
  };

  client.on("notification", () => {
    chain = chain
      .then(async () => {
        const result = await getPool().query(
          `SELECT ${EVENT_COLUMNS} FROM order_events WHERE id > $1 ORDER BY id ASC`,
          [lastId],
        );
        for (const row of result.rows) {
          const event = toStoredEvent(row);
          await handler(event);
          lastId = event.id;
        }
      })
      .catch((err) => {
        console.error("[backend:eventstore] subscriber failed", err);
      });
  });

  return cleanup;
}

export async function replayOrderEvents(
  handler: (event: StoredEvent) => Promise<void>,
): Promise<number> {
  await initOrderEventsTable();
  const result = await getPool().query(
    `SELECT ${EVENT_COLUMNS} FROM order_events ORDER BY id ASC`,
  );
  let lastId = 0;
  for (const row of result.rows) {
    const event = toStoredEvent(row);
    await handler(event);
    lastId = event.id;
  }
  return lastId;
}
