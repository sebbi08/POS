import { v4 as uuid } from "uuid";
import { appendOrderEvent } from "./order-eventstore";
import {
  OrderOpenedEvent,
  ItemAddedEvent,
  ItemRemovedEvent,
  PickupReceiptPrintedEvent,
  FinalReceiptPrintedEvent,
  OrderClosedEvent,
  OrderCancellationCreatedEvent,
} from "./orders.types";

const STREAM = (id: string) => `order-${id}`;

export async function openOrder(terminalId: string): Promise<string> {
  const id = uuid();
  const data: OrderOpenedEvent = { id, terminalId };
  await appendOrderEvent(STREAM(id), "OrderOpened", data as unknown as Record<string, unknown>);
  return id;
}

export async function addItemToOrder(
  orderId: string,
  itemId: string,
  name: string,
  qty: number,
  unitPrice: number,
  vatRate: number
): Promise<void> {
  const total = unitPrice * qty;
  const vatAmount = total - total / (1 + vatRate / 100);

  const data: ItemAddedEvent = {
    orderId,
    itemId,
    name,
    qty,
    unitPrice,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
  await appendOrderEvent(STREAM(orderId), "ItemAdded", data as unknown as Record<string, unknown>);
}

export async function removeItemFromOrder(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: ItemRemovedEvent = { orderId, itemId };
  await appendOrderEvent(STREAM(orderId), "ItemRemoved", data as unknown as Record<string, unknown>);
}

export async function printPickupReceipt(orderId: string, itemId: string): Promise<void> {
  const data: PickupReceiptPrintedEvent = { orderId, itemId };
  await appendOrderEvent(STREAM(orderId), "PickupReceiptPrinted", data as unknown as Record<string, unknown>);
}

export async function printFinalReceipt(orderId: string): Promise<void> {
  const data: FinalReceiptPrintedEvent = { orderId };
  await appendOrderEvent(STREAM(orderId), "FinalReceiptPrinted", data as unknown as Record<string, unknown>);
}

export async function closeOrder(orderId: string, opts?: { cancelled?: boolean }): Promise<void> {
  const { orders } = require("./orders.projections");
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const totalGross = order.items.reduce((sum: number, i: { total: number }) => sum + i.total, 0);
  const totalVat: Record<number, number> = {};
  for (const item of order.items) {
    totalVat[item.vatRate] =
      (totalVat[item.vatRate] || 0) + item.vatAmount;
  }
  const totalNet = totalGross - Object.values(totalVat).reduce((a, b) => a + b, 0);

  const data: OrderClosedEvent = {
    orderId,
    totalGross: Math.round(totalGross * 100) / 100,
    totalVat: Object.fromEntries(
      Object.entries(totalVat).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    totalNet: Math.round(totalNet * 100) / 100,
    cancelled: opts?.cancelled,
  };
  await appendOrderEvent(STREAM(orderId), "OrderClosed", data as unknown as Record<string, unknown>);
}

export async function cancelOrder(
  originalOrderId: string,
  terminalId: string,
  reason?: string
): Promise<string> {
  const { orders } = require("./orders.projections");
  const original = orders.get(originalOrderId);
  if (!original) throw new Error(`Order ${originalOrderId} not found`);
  if (original.cancelledByOrderId) throw new Error(`Order already cancelled`);

  // Open orders: just close them (discard, no financial record needed)
  if (original.status === "open") {
    await closeOrder(originalOrderId, { cancelled: true });
    return "";
  }

  // Closed orders: create a separate cancellation order with negated values
  if (original.status !== "closed") throw new Error(`Only open or closed orders can be cancelled`);

  const id = uuid();
  const title = reason || `Cancellation of order #${originalOrderId}`;

  const items = original.items.map((item: { itemId: string; name: string; qty: number; unitPrice: number; vatRate: number; vatAmount: number; total: number }) => ({
    ...item,
    qty: -item.qty,
    total: -item.total,
    vatAmount: -item.vatAmount,
  }));

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
  await appendOrderEvent(STREAM(id), "OrderCancellationCreated", data as unknown as Record<string, unknown>);
  return id;
}
