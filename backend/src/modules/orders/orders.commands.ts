import { v4 as uuid } from "uuid";
import { appendOrderEvent } from "./order-eventstore.js";
import { orders } from "./orders.projections.js";
import {
  OrderCancellationCreatedEvent,
  OrderClosedEvent,
} from "./orders.types.js";

const STREAM = (id: string) => `order-${id}`;

export async function closeOrder(
  orderId: string,
  opts?: { cancelled?: boolean },
): Promise<void> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);

  const totalGross = order.items.reduce(
    (sum: number, i: { total: number }) => sum + i.total,
    0,
  );
  const totalVat: Record<number, number> = {};
  for (const item of order.items) {
    totalVat[item.vatRate] = (totalVat[item.vatRate] || 0) + item.vatAmount;
  }
  const totalNet =
    totalGross - Object.values(totalVat).reduce((a, b) => a + b, 0);

  const data: OrderClosedEvent = {
    orderId,
    totalGross: Math.round(totalGross * 100) / 100,
    totalVat: Object.fromEntries(
      Object.entries(totalVat).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    totalNet: Math.round(totalNet * 100) / 100,
    cancelled: opts?.cancelled,
  };
  await appendOrderEvent(
    STREAM(orderId),
    "OrderClosed",
    data as unknown as Record<string, unknown>,
  );
}

export async function cancelOrder(
  originalOrderId: string,
  terminalId: string,
  reason?: string,
): Promise<string> {
  const original = orders.get(originalOrderId);
  if (!original) throw new Error(`Bestellung ${originalOrderId} nicht gefunden`);
  if (original.cancelledByOrderId) throw new Error(`Bestellung bereits storniert`);

  // Open orders: just close them (discard, no financial record needed)
  if (original.status === "open") {
    await closeOrder(originalOrderId, { cancelled: true });
    return "";
  }

  // Closed orders: create a separate cancellation order with negated values
  if (original.status !== "closed")
    throw new Error(`Nur offene oder abgeschlossene Bestellungen können storniert werden`);

  const id = uuid();
  const title = reason || `Storno zu Bestellung #${originalOrderId.slice(0, 8)}`;

  const items = original.items.map(
    (item: {
      itemId: string;
      name: string;
      qty: number;
      unitPrice: number;
      vatRate: number;
      vatAmount: number;
      total: number;
    }) => ({
      ...item,
      qty: -item.qty,
      total: -item.total,
      vatAmount: -item.vatAmount,
    }),
  );

  const totalGross = -original.totalGross;
  const totalNet = -original.totalNet;
  const totalVat: Record<number, number> = {};
  for (const [rate, amount] of Object.entries(original.totalVat)) {
    totalVat[Number(rate)] = -(amount as number);
  }

  const now = new Date().toISOString();

  const data: OrderCancellationCreatedEvent = {
    id,
    terminalId,
    title,
    cancelsOrderId: originalOrderId,
    items,
    totalGross,
    totalVat,
    totalNet,
    createdAt: now,
    closedAt: now,
  };
  await appendOrderEvent(
    STREAM(id),
    "OrderCancellationCreated",
    data as unknown as Record<string, unknown>,
  );
  return id;
}
