import type { BookingUpload } from "../../shared/contract";
import type { LocalEvent } from "../../shared/types";
import type { LocalOrder } from "./orders";

function unsynced(orders: Map<string, LocalOrder>, synced: Record<string, string>): LocalOrder[] {
  return [...orders.values()]
    .filter((o) => o.status === "closed" && !(o.id in synced))
    .sort((a, b) => a.firstSeq - b.firstSeq);
}

export function pendingUploads(events: LocalEvent[], orders: Map<string, LocalOrder>, synced: Record<string, string>): BookingUpload[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  return unsynced(orders, synced).map((o) => ({
    orderId: o.id,
    events: sorted
      .filter((e) => e.orderId === o.id)
      .map((e) => ({ type: e.type, data: e.data, occurredAt: e.occurredAt })),
  }));
}

export function unsyncedCount(orders: Map<string, LocalOrder>, synced: Record<string, string>): number {
  return unsynced(orders, synced).length;
}

export function cancellableOrders(orders: Map<string, LocalOrder>, synced: Record<string, string>): LocalOrder[] {
  return unsynced(orders, synced).filter((o) => !o.discarded && !o.cancelledByOrderId && !o.cancelsOrderId);
}
