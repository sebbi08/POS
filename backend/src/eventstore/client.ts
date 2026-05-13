import { Pool, PoolClient } from "pg";
import { config } from "../config";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.pg.connectionString });
  }
  return pool;
}

let tableInitialized = false;

export async function initEventStore(): Promise<void> {
  if (tableInitialized) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        stream_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_events_stream_id ON events (stream_id);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
    `);
    tableInitialized = true;
  } finally {
    client.release();
  }
}

export async function appendEvent(
  streamName: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  await initEventStore();
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO events (stream_id, event_type, data) VALUES ($1, $2, $3)`,
      [streamName, eventType, JSON.stringify(data)]
    );
    await client.query(`NOTIFY "${streamName}", '1'`);
    await client.query(`NOTIFY "all_events", '1'`);
  } finally {
    client.release();
  }
}

export async function appendEvents(
  streamName: string,
  events: { type: string; data: Record<string, unknown> }[]
): Promise<void> {
  await initEventStore();
  const client = await getPool().connect();
  try {
    for (const e of events) {
      await client.query(
        `INSERT INTO events (stream_id, event_type, data) VALUES ($1, $2, $3)`,
        [streamName, e.type, JSON.stringify(e.data)]
      );
    }
    await client.query(`NOTIFY "${streamName}", '1'`);
    await client.query(`NOTIFY "all_events", '1'`);
  } finally {
    client.release();
  }
}

export async function readStream<E = Record<string, unknown>>(
  streamName: string
): Promise<{ type: string; data: E; created: Date }[]> {
  await initEventStore();
  const result = await getPool().query(
    `SELECT event_type, data, created_at FROM events WHERE stream_id = $1 ORDER BY id ASC`,
    [streamName]
  );
  return result.rows.map((row) => ({
    type: row.event_type,
    data: row.data as E,
    created: new Date(row.created_at),
  }));
}

export async function subscribeToAll(
  handler: (event: { type: string; data: Record<string, unknown>; streamId: string }) => void
): Promise<() => void> {
  await initEventStore();
  const client = await getPool().connect();
  await client.query('LISTEN "all_events"');

  const cleanup = () => {
    client.release();
  };

  client.on("notification", async () => {
    const result = await getPool().query(
      `SELECT stream_id, event_type, data FROM events ORDER BY id DESC LIMIT 1`
    );
    for (const row of result.rows) {
      handler({
        type: row.event_type,
        data: row.data,
        streamId: row.stream_id,
      });
    }
  });

  return cleanup;
}

export async function replayAll(
  handler: (event: { type: string; data: Record<string, unknown>; streamId: string }) => Promise<void>
): Promise<void> {
  await initEventStore();
  const result = await getPool().query(
    `SELECT stream_id, event_type, data FROM events ORDER BY id ASC`
  );
  for (const row of result.rows) {
    await handler({
      type: row.event_type,
      data: row.data,
      streamId: row.stream_id,
    });
  }
}
