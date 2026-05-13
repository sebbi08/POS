import { registerProjection } from "../../projections/runner";
import { Order, OrderItem, OrderStatus } from "./orders.types";

export const orders: Map<string, Order> = new Map();

export function initOrderProjections(): void {
  registerProjection("orders", "order", (event) => {
    switch (event.type) {
      case "OrderOpened": {
        const data = event.data;
        orders.set(data.id as string, {
          id: data.id as string,
          terminalId: data.terminalId as string,
          userId: data.userId as string,
          status: "open",
          items: [],
          pickupSeq: 0,
          totalGross: 0,
          totalVat: {},
          totalNet: 0,
          createdAt: new Date(),
        });
        break;
      }
      case "ItemAdded": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          const existing = order.items.find(
            (i) => i.itemId === (data.itemId as string)
          );
          if (existing) {
            existing.qty += data.qty as number;
            existing.total += data.total as number;
            existing.vatAmount += data.vatAmount as number;
          } else {
            order.items.push({
              itemId: data.itemId as string,
              name: data.name as string,
              qty: data.qty as number,
              unitPrice: data.unitPrice as number,
              vatRate: data.vatRate as number,
              vatAmount: data.vatAmount as number,
              total: data.total as number,
            });
          }
        }
        break;
      }
      case "ItemRemoved": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.items = order.items.filter(
            (i) => i.itemId !== (data.itemId as string)
          );
        }
        break;
      }
      case "PickupReceiptPrinted": {
        const order = orders.get(event.data.orderId as string);
        if (order) order.pickupSeq++;
        break;
      }
      case "OrderPaid": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.status = "paid" as OrderStatus;
          order.totalGross = data.totalGross as number;
          order.totalVat = data.totalVat as Record<number, number>;
          order.totalNet = data.totalNet as number;
        }
        break;
      }
      case "OrderClosed": {
        const order = orders.get(event.data.orderId as string);
        if (order) {
          order.status = "closed" as OrderStatus;
          order.closedAt = new Date();
        }
        break;
      }
      case "OrderCancelled": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.status = "cancelled" as OrderStatus;
          order.closedAt = new Date();
          order.cancelledReason = data.reason as string;
        }
        break;
      }
    }
  });
}

export function getOpenOrdersByTerminal(terminalId: string): Order[] {
  const result: Order[] = [];
  for (const order of orders.values()) {
    if (order.terminalId === terminalId && order.status === "open") {
      result.push(order);
    }
  }
  return result;
}

export function getLastClosedOrder(
  terminalId: string,
  userId: string
): Order | null {
  let last: Order | null = null;
  for (const order of orders.values()) {
    if (
      order.terminalId === terminalId &&
      order.userId === userId &&
      (order.status === "closed" || order.status === "cancelled")
    ) {
      if (!last || (order.closedAt && last.closedAt && order.closedAt > last.closedAt)) {
        last = order;
      }
    }
  }
  return last;
}
