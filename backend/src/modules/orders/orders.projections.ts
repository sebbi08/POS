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
      case "OrderClosed": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.status = "closed" as OrderStatus;
          order.totalGross = data.totalGross as number;
          order.totalVat = data.totalVat as Record<number, number>;
          order.totalNet = data.totalNet as number;
          order.closedAt = new Date();
        }
        break;
      }
      case "OrderCancellationCreated": {
        const data = event.data;
        const order: Order = {
          id: data.id as string,
          terminalId: data.terminalId as string,
          status: "closed",
          items: (data.items as OrderItem[]).map((i) => ({
            ...i,
            qty: Number(i.qty),
            unitPrice: Number(i.unitPrice),
            vatRate: Number(i.vatRate),
            vatAmount: Number(i.vatAmount),
            total: Number(i.total),
          })),
          pickupSeq: 0,
          totalGross: data.totalGross as number,
          totalVat: data.totalVat as Record<number, number>,
          totalNet: data.totalNet as number,
          createdAt: new Date(data.createdAt as string),
          closedAt: new Date(data.closedAt as string),
          title: data.title as string,
          cancelsOrderId: data.cancelsOrderId as string,
        };
        orders.set(order.id, order);

        const original = orders.get(data.cancelsOrderId as string);
        if (original) {
          original.cancelledByOrderId = data.id as string;
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
