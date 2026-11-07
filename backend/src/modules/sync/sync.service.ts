import type { PoolClient } from "pg";
import { getPool, initTables } from "../../db.js";
import { listGroups, listItems } from "../catalog/catalog.repository.js";
import { getCompanySettings } from "../company/company.repository.js";
import { insertOrderEvents } from "../orders/order-eventstore.js";
import { orders } from "../orders/orders.projections.js";
import { Terminal } from "../terminals/terminals.types.js";
import {
  BookingUpload,
  CatalogSnapshot,
  UploadResponse,
} from "./sync.types.js";
import { validateUpload } from "./sync.validation.js";

export async function getCatalogSnapshot(
  terminal: Terminal,
): Promise<CatalogSnapshot> {
  const [allGroups, allItems, company] = await Promise.all([
    listGroups(),
    listItems(),
    getCompanySettings(),
  ]);
  const groupIds = new Set(terminal.groupIds);
  return {
    serverTime: new Date().toISOString(),
    terminal: {
      id: terminal.id,
      name: terminal.name,
      printPickupReceipts: terminal.printPickupReceipts,
    },
    company,
    groups: allGroups
      .filter((g) => groupIds.has(g.id))
      .map(({ id, name, vatRate }) => ({ id, name, vatRate })),
    items: allItems
      .filter((i) => groupIds.has(i.groupId))
      .map(({ id, name, groupId, price }) => ({ id, name, groupId, price })),
  };
}

const CANCELS_INDEX = "idx_synced_orders_cancels";

function isCancelsConflict(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && e.constraint === CANCELS_INDEX;
}

/**
 * Stores one booking in its own transaction and returns a German error text,
 * or null on success. On failure the transaction is rolled back so nothing is
 * half-stored.
 */
async function storeBooking(
  terminalId: string,
  u: BookingUpload,
): Promise<string | null> {
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (err) {
    console.error(`[backend:sync] no connection for ${u.orderId}`, err);
    return "Speichern fehlgeschlagen";
  }
  const first = u.events[0];
  const cancelsOrderId =
    first.type === "OrderCancellationCreated"
      ? (first.data.cancelsOrderId as string)
      : null;
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    // A re-upload hits ON CONFLICT (order_id); a different cancellation of an
    // already cancelled sale violates the unique index on cancels_order_id.
    const inserted = await client.query(
      `INSERT INTO synced_orders (order_id, terminal_id, cancels_order_id) VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO NOTHING RETURNING order_id`,
      [u.orderId, terminalId, cancelsOrderId],
    );
    // No row: the booking was stored by an earlier upload.
    if (inserted.rows.length > 0) {
      await insertOrderEvents(
        client,
        "order-" + u.orderId,
        u.events.map((e) => ({
          type: e.type,
          data: e.data,
          occurredAt: new Date(e.occurredAt),
        })),
      );
    }
    await client.query("COMMIT");
    return null;
  } catch (err) {
    await client.query("ROLLBACK").catch((rollbackErr: Error) => {
      broken = rollbackErr;
    });
    if (isCancelsConflict(err)) return "Buchung wurde bereits storniert";
    console.error(`[backend:sync] storing ${u.orderId} failed`, err);
    return "Speichern fehlgeschlagen";
  } finally {
    // Passing an error makes the pool discard a connection in unknown state.
    client.release(broken);
  }
}

export async function ingestUploads(
  terminalId: string,
  uploads: BookingUpload[],
): Promise<UploadResponse> {
  await initTables();
  const accepted: string[] = [];
  const rejected: { orderId: string; error: string }[] = [];
  // The live projection may not have applied this batch's commits yet.
  const acceptedSales = new Set<string>();
  const cancelledInBatch = new Map<string, string>();

  const isKnownSale = async (
    saleId: string,
    cancellationId: string,
  ): Promise<boolean> => {
    const cancelledBy = cancelledInBatch.get(saleId);
    if (cancelledBy !== undefined && cancelledBy !== cancellationId) {
      return false;
    }
    const order = orders.get(saleId);
    if (order) {
      return (
        order.terminalId === terminalId &&
        !order.cancelsOrderId &&
        // A re-upload of the very cancellation that is already applied.
        (!order.cancelledByOrderId ||
          order.cancelledByOrderId === cancellationId)
      );
    }
    if (acceptedSales.has(saleId)) return true;
    // Stored by an earlier upload that the projection has not applied yet. A
    // second cancellation is still refused by the unique cancels_order_id index.
    const stored = await getPool().query(
      `SELECT 1 FROM synced_orders
       WHERE order_id = $1 AND terminal_id = $2 AND cancels_order_id IS NULL`,
      [saleId, terminalId],
    );
    return stored.rows.length > 0;
  };

  for (const u of uploads) {
    const orderId = typeof u?.orderId === "string" ? u.orderId : "";
    const error = await validateUpload(u, terminalId, (id) =>
      isKnownSale(id, orderId),
    );
    if (error) {
      rejected.push({ orderId, error });
      continue;
    }
    // Same stream id as another terminal's order would merge both streams.
    const existing = orders.get(orderId);
    if (existing && existing.terminalId !== terminalId) {
      rejected.push({ orderId, error: "Buchungs-ID bereits vergeben" });
      continue;
    }
    const storeError = await storeBooking(terminalId, u);
    if (storeError) {
      rejected.push({ orderId, error: storeError });
      continue;
    }
    accepted.push(orderId);
    const first = u.events[0];
    if (first.type === "OrderCancellationCreated") {
      cancelledInBatch.set(first.data.cancelsOrderId as string, orderId);
    } else {
      acceptedSales.add(orderId);
    }
  }

  return { serverTime: new Date().toISOString(), accepted, rejected };
}
