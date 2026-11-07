import type { BookingUpload } from "../../shared/contract";
import type { LocalEvent } from "../../shared/types";
import type { LocalOrder } from "./orders";

function unsynced(orders: Map<string, LocalOrder>, synced: Record<string, string>): LocalOrder[] {
  return [...orders.values()]
    .filter((o) => o.status === "closed" && !(o.id in synced))
    .sort((a, b) => a.firstSeq - b.firstSeq);
}

export function pendingUploads(events: LocalEvent[], orders: Map<string, LocalOrder>, synced: Record<string, string>): BookingUpload[] {
  const byOrder = new Map<string, BookingUpload["events"]>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    let list = byOrder.get(e.orderId);
    if (!list) byOrder.set(e.orderId, (list = []));
    list.push({ type: e.type, data: e.data, occurredAt: e.occurredAt });
  }
  return unsynced(orders, synced).map((o) => ({ orderId: o.id, events: byOrder.get(o.id) ?? [] }));
}

/** Bookings still to upload. Discarded orders are uploaded too but are no booking to count. */
export function unsyncedCount(orders: Map<string, LocalOrder>, synced: Record<string, string>): number {
  return unsynced(orders, synced).filter((o) => !o.discarded).length;
}

/** Whether any closed order, discarded ones included, still waits for the upload. */
export function hasPendingUploads(orders: Map<string, LocalOrder>, synced: Record<string, string>): boolean {
  for (const o of orders.values()) if (o.status === "closed" && !(o.id in synced)) return true;
  return false;
}

export function cancellableOrders(orders: Map<string, LocalOrder>, synced: Record<string, string>): LocalOrder[] {
  return unsynced(orders, synced).filter((o) => !o.discarded && !o.cancelledByOrderId && !o.cancelsOrderId);
}
