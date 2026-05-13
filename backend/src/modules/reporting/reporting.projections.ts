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
        const existing = transactionHistory.find((t) => t.orderId === orderId);
        if (existing) {
          existing.status = "closed";
          existing.closedAt = new Date().toISOString();
          dailyReport.orderCount++;
        }
        break;
      }
      case "OrderPaid": {
        const data = event.data;
        const orderId = data.orderId as string;
        const order = ordersMap.get(orderId);

        if (order) {
          const userName = order.terminalId;

          const itemsText = order.items
            .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
            .join(", ");

          transactionHistory.push({
            orderId,
            terminalId: order.terminalId,
            userId: order.userId,
            userName,
            items: itemsText,
            itemCount: order.items.length,
            totalGross: data.totalGross as number,
            totalVat: Object.values(
              data.totalVat as Record<number, number>
            ).reduce((a: number, b: number) => a + b, 0),
            status: "paid",
            closedAt: new Date().toISOString(),
          });
        }
        break;
      }
      case "OrderCancelled": {
        const data = event.data;
        const orderId = data.orderId as string;

        const existing = transactionHistory.find((t) => t.orderId === orderId);
        if (existing) {
          existing.status = "cancelled";
          existing.reason = data.reason as string;
          existing.closedAt = new Date().toISOString();
        }
        dailyReport.cancelledCount++;
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
