import { registerProjection } from "../../projections/runner.js";
import { orders as ordersMap } from "../orders/orders.projections.js";
import { DailyReport, TransactionRecord } from "./reporting.types.js";

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

export const itemCounts: Map<string, { name: string; count: number }> =
  new Map();

export function initReportingProjections(): void {
  registerProjection("reporting", "order", (event) => {
    switch (event.type) {
      case "OrderClosed": {
        const data = event.data;
        const orderId = data.orderId as string;
        const order = ordersMap.get(orderId);
        if (order && !order.cancelsOrderId) {
          const totalVatValue = Object.values(
            data.totalVat as Record<number, number>,
          ).reduce((a: number, b: number) => a + b, 0);
          const cancelled = data.cancelled as boolean | undefined;
          const status = cancelled ? "cancelled" : "closed";

          const existingIdx = transactionHistory.findIndex(
            (t) => t.orderId === orderId,
          );
          if (existingIdx >= 0) {
            transactionHistory[existingIdx] = {
              ...transactionHistory[existingIdx],
              totalGross: data.totalGross as number,
              totalVat: totalVatValue,
              status,
              closedAt: new Date().toISOString(),
            };
          } else {
            const itemsText = order.items
              .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
              .join(", ");

            transactionHistory.push({
              orderId,
              terminalId: order.terminalId,
              items: itemsText,
              itemCount: order.items.length,
              totalGross: data.totalGross as number,
              totalVat: totalVatValue,
              status,
              closedAt: new Date().toISOString(),
            });
          }

          if (!cancelled) {
            dailyReport.orderCount++;
            dailyReport.totalGross += data.totalGross as number;
            dailyReport.totalVat += totalVatValue;
            dailyReport.totalNet += data.totalNet as number;

            for (const item of order.items) {
              const rateKey = String(item.vatRate);
              if (!dailyReport.vatByGroup[rateKey]) {
                dailyReport.vatByGroup[rateKey] = {
                  rate: item.vatRate,
                  gross: 0,
                  vat: 0,
                };
              }
              dailyReport.vatByGroup[rateKey].gross += item.total;
              dailyReport.vatByGroup[rateKey].vat += item.vatAmount;
            }

            const tid = order.terminalId;
            if (!dailyReport.byTerminal[tid]) {
              dailyReport.byTerminal[tid] = { orderCount: 0, total: 0 };
            }
            dailyReport.byTerminal[tid].orderCount++;
            dailyReport.byTerminal[tid].total += data.totalGross as number;
          }
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
            totalVat: Object.values(order.totalVat).reduce(
              (a: number, b: number) => a + b,
              0,
            ),
            status: "cancelled",
            title: data.title as string,
            cancelsOrderId,
            closedAt: new Date().toISOString(),
          });

          dailyReport.cancelledCount++;

          const origTx = transactionHistory.find(
            (t) => t.orderId === cancelsOrderId,
          );
          if (origTx && origTx.status !== "cancelled") {
            origTx.status = "cancelled";
          }

          const original = ordersMap.get(cancelsOrderId);
          if (original) {
            dailyReport.orderCount = Math.max(0, dailyReport.orderCount - 1);
            dailyReport.totalGross -= original.totalGross;
            dailyReport.totalVat -= Object.values(original.totalVat).reduce(
              (a: number, b: number) => a + b,
              0,
            );
            dailyReport.totalNet -= original.totalNet;

            for (const item of original.items) {
              const rateKey = String(item.vatRate);
              if (dailyReport.vatByGroup[rateKey]) {
                dailyReport.vatByGroup[rateKey].gross -= item.total;
                dailyReport.vatByGroup[rateKey].vat -= item.vatAmount;
              }
            }

            const tid = original.terminalId;
            if (dailyReport.byTerminal[tid]) {
              dailyReport.byTerminal[tid].orderCount = Math.max(
                0,
                dailyReport.byTerminal[tid].orderCount - 1,
              );
              dailyReport.byTerminal[tid].total -= original.totalGross;
            }

            for (const item of original.items) {
              const existing = itemCounts.get(item.itemId);
              if (existing) {
                existing.count -= item.qty;
                if (existing.count <= 0) {
                  itemCounts.delete(item.itemId);
                }
              }
            }
          }
        }
        break;
      }
      case "ItemAdded": {
        const name = event.data.name as string;
        const itemId = event.data.itemId as string;
        const orderId = event.data.orderId as string;
        const order = ordersMap.get(orderId);
        if (order && order.cancelsOrderId) break;

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
