import { registerProjection } from "../../projections/runner";
import { DailyReport, TransactionRecord } from "./reporting.types";
import { orders as ordersMap } from "../orders/orders.projections";

export const transactionHistory: TransactionRecord[] = [];
export const dailyReport: DailyReport = {
  date: new Date().toISOString().split("T")[0],
  orderCount: 0,
  cancelledCount: 0,
  totalGross: 0,
  totalVat: 0,
  totalNet: 0,
  vatByGroup: {},
  byTerminal: {},
  topItems: [],
};

const itemCounts: Map<string, { name: string; count: number }> = new Map();

export function initReportingProjections(): void {
  registerProjection("reporting", "order", (event) => {
    switch (event.type) {
      case "OrderClosed": {
        const orderId = event.data.orderId as string;
        const order = ordersMap.get(orderId);
        if (order && !order.cancelsOrderId) {
          const existingIdx = transactionHistory.findIndex((t) => t.orderId === orderId);
          if (existingIdx >= 0) {
            transactionHistory[existingIdx].status = "closed";
            transactionHistory[existingIdx].closedAt = new Date().toISOString();
          }
          dailyReport.orderCount++;
        }
        break;
      }
      case "OrderPaid": {
        const data = event.data;
        const orderId = data.orderId as string;
        const order = ordersMap.get(orderId);

        if (order) {
          const itemsText = order.items
            .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
            .join(", ");

          const totalVat = Object.values(
            data.totalVat as Record<number, number>
          ).reduce((a: number, b: number) => a + b, 0);

          transactionHistory.push({
            orderId,
            terminalId: order.terminalId,
            items: itemsText,
            itemCount: order.items.length,
            totalGross: data.totalGross as number,
            totalVat,
            status: "paid",
            closedAt: new Date().toISOString(),
          });
        }
        break;
      }
      case "OrderCancellationCreated": {
        const data = event.data;
        const id = data.id as string;
        const cancelsOrderId = data.cancelsOrderId as string;
        const order = ordersMap.get(id);

        if (order) {
          const itemsText = order.items
            .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
            .join(", ");

          transactionHistory.push({
            orderId: id,
            terminalId: order.terminalId,
            items: itemsText,
            itemCount: order.items.length,
            totalGross: order.totalGross,
            totalVat: Object.values(order.totalVat).reduce((a: number, b: number) => a + b, 0),
            status: "cancelled",
            title: data.title as string,
            cancelsOrderId,
            closedAt: new Date().toISOString(),
          });

          dailyReport.cancelledCount++;
        }
        break;
      }
      case "ItemAdded": {
        const name = event.data.name as string;
        const itemId = event.data.itemId as string;
        const existing = itemCounts.get(itemId);
        if (existing) {
          existing.count += event.data.qty as number;
        } else {
          itemCounts.set(itemId, { name, count: event.data.qty as number });
        }
        break;
      }
    }
  });
}

export function getDailyReport(date?: string): DailyReport {
  if (date) {
    dailyReport.date = date;
  }
  const topItems = Array.from(itemCounts.entries())
    .map(([itemId, { name, count }]) => ({ itemId, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { ...dailyReport, topItems };
}
