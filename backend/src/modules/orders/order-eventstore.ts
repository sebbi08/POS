import { getPool } from "../../db.js";

let tableInitialized = false;

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
): Promise<void> {
  await initOrderEventsTable();
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO order_events (stream_id, event_type, data) VALUES ($1, $2, $3)`,
      [streamId, eventType, JSON.stringify(data)],
    );
    await client.query(`NOTIFY "${streamId}", '1'`);
    await client.query(`NOTIFY "order_events", '1'`);
  } finally {
    client.release();
  }
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

export async function subscribeToOrderEvents(
  handler: (event: {
    type: string;
    data: Record<string, unknown>;
    streamId: string;
  }) => void,
): Promise<() => void> {
  await initOrderEventsTable();
  const client = await getPool().connect();
  await client.query('LISTEN "order_events"');

  const cleanup = () => {
    client.release();
  };

  client.on("notification", async () => {
    const result = await getPool().query(
      `SELECT stream_id, event_type, data FROM order_events ORDER BY id DESC LIMIT 1`,
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

export async function replayOrderEvents(
  handler: (event: {
    type: string;
    data: Record<string, unknown>;
    streamId: string;
  }) => Promise<void>,
): Promise<void> {
  await initOrderEventsTable();
  const result = await getPool().query(
    `SELECT stream_id, event_type, data FROM order_events ORDER BY id ASC`,
  );
  for (const row of result.rows) {
    await handler({
      type: row.event_type,
      data: row.data,
      streamId: row.stream_id,
    });
  }
}
