import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import { groups } from "../catalog/catalog.projections";
import { items } from "../catalog/catalog.projections";
import {
  OrderOpenedEvent,
  ItemAddedEvent,
  ItemRemovedEvent,
  PickupReceiptPrintedEvent,
  FinalReceiptPrintedEvent,
  OrderPaidEvent,
  OrderClosedEvent,
  OrderCancelledEvent,
} from "./orders.types";

const STREAM = (id: string) => `order-${id}`;

export async function openOrder(
  terminalId: string,
  userId: string
): Promise<string> {
  const id = uuid();
  const data: OrderOpenedEvent = { id, terminalId, userId };
  await appendEvent(STREAM(id), "OrderOpened", data as unknown as Record<string, unknown>);
  return id;
}

export async function addItemToOrder(
  orderId: string,
  itemId: string,
  qty: number
): Promise<void> {
  const item = items.get(itemId);
  if (!item || item.archived) throw new Error(`Item ${itemId} not found`);

  const group = groups.get(item.groupId);
  const vatRate = group ? group.vatRate : 0;
  const total = item.price * qty;
  const vatAmount = total - total / (1 + vatRate / 100);

  const data: ItemAddedEvent = {
    orderId,
    itemId,
    name: item.name,
    qty,
    unitPrice: item.price,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
  await appendEvent(STREAM(orderId), "ItemAdded", data as unknown as Record<string, unknown>);
}

export async function removeItemFromOrder(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: ItemRemovedEvent = { orderId, itemId };
  await appendEvent(STREAM(orderId), "ItemRemoved", data as unknown as Record<string, unknown>);
}

export async function printPickupReceipt(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: PickupReceiptPrintedEvent = { orderId, itemId };
  await appendEvent(STREAM(orderId), "PickupReceiptPrinted", data as unknown as Record<string, unknown>);
}

export async function printFinalReceipt(orderId: string): Promise<void> {
  const data: FinalReceiptPrintedEvent = { orderId };
  await appendEvent(STREAM(orderId), "FinalReceiptPrinted", data as unknown as Record<string, unknown>);
}

export async function payOrder(orderId: string): Promise<void> {
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

  const data: OrderPaidEvent = {
    orderId,
    totalGross: Math.round(totalGross * 100) / 100,
    totalVat: Object.fromEntries(
      Object.entries(totalVat).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    totalNet: Math.round(totalNet * 100) / 100,
  };
  await appendEvent(STREAM(orderId), "OrderPaid", data as unknown as Record<string, unknown>);
}

export async function closeOrder(orderId: string): Promise<void> {
  const data: OrderClosedEvent = { orderId };
  await appendEvent(STREAM(orderId), "OrderClosed", data as unknown as Record<string, unknown>);
}

export async function cancelOrder(
  orderId: string,
  reason: string,
  userId: string
): Promise<void> {
  const data: OrderCancelledEvent = { orderId, reason, userId };
  await appendEvent(STREAM(orderId), "OrderCancelled", data as unknown as Record<string, unknown>);
}
