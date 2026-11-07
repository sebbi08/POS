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

/**
 * Stores one booking in its own transaction. Returns false when anything
 * failed; the transaction is then rolled back so nothing is half-stored.
 */
async function storeBooking(
  terminalId: string,
  u: BookingUpload,
): Promise<boolean> {
  const client = await getPool().connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO synced_orders (order_id, terminal_id) VALUES ($1, $2)
       ON CONFLICT (order_id) DO NOTHING RETURNING order_id`,
      [u.orderId, terminalId],
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
    return true;
  } catch (err) {
    console.error(`[backend:sync] storing ${u.orderId} failed`, err);
    await client.query("ROLLBACK").catch((rollbackErr: Error) => {
      broken = rollbackErr;
    });
    return false;
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

  const isKnownSale = (saleId: string, cancellationId: string): boolean => {
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
    return acceptedSales.has(saleId);
  };

  for (const u of uploads) {
    const orderId = typeof u?.orderId === "string" ? u.orderId : "";
    const error = validateUpload(u, terminalId, (id) =>
      isKnownSale(id, orderId),
    );
    if (error) {
      rejected.push({ orderId, error });
      continue;
    }
    if (!(await storeBooking(terminalId, u))) {
      rejected.push({ orderId, error: "Speichern fehlgeschlagen" });
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
