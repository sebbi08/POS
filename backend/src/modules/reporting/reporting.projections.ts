import { orders } from "../orders/orders.projections.js";
import { Order } from "../orders/orders.types.js";
import { BookingDay, Report, TransactionRecord } from "./reporting.types.js";

export function berlinDay(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/** A counter-booking counts at the time of the sale it cancels. */
export function effectiveTime(o: Order): Date | undefined {
  if (o.cancelsOrderId) {
    return orders.get(o.cancelsOrderId)?.closedAt ?? o.closedAt;
  }
  return o.closedAt;
}

function isSale(o: Order): boolean {
  return o.status === "closed" && !o.cancelsOrderId && !o.discarded;
}

function inRange(t: Date | undefined, from: string, to: string): boolean {
  if (!t) return false;
  const day = berlinDay(t);
  return day >= from && day <= to;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

const sumVat = (v: Record<number, number>): number =>
  Object.values(v).reduce((a, b) => a + b, 0);

export function getReport(from: string, to: string): Report {
  const report: Report = {
    from,
    to,
    orderCount: 0,
    cancelledCount: 0,
    totalGross: 0,
    totalVat: 0,
    totalNet: 0,
    vatByGroup: {},
    byTerminal: {},
    topItems: [],
  };
  const itemCounts = new Map<string, { name: string; count: number }>();

  for (const order of orders.values()) {
    if (!isSale(order) || !inRange(order.closedAt, from, to)) continue;

    if (order.cancelledByOrderId) {
      report.cancelledCount++;
      continue;
    }

    report.orderCount++;
    report.totalGross += order.totalGross;
    report.totalVat += sumVat(order.totalVat);
    report.totalNet += order.totalNet;

    for (const item of order.items) {
      const rateKey = String(item.vatRate);
      const group = (report.vatByGroup[rateKey] ??= {
        rate: item.vatRate,
        gross: 0,
        vat: 0,
      });
      group.gross += item.total;
      group.vat += item.vatAmount;

      const counted = itemCounts.get(item.itemId);
      if (counted) counted.count += item.qty;
      else itemCounts.set(item.itemId, { name: item.name, count: item.qty });
    }

    const terminal = (report.byTerminal[order.terminalId] ??= {
      orderCount: 0,
      total: 0,
    });
    terminal.orderCount++;
    terminal.total += order.totalGross;
  }

  report.totalGross = round2(report.totalGross);
  report.totalVat = round2(report.totalVat);
  report.totalNet = round2(report.totalNet);
  for (const g of Object.values(report.vatByGroup)) {
    g.gross = round2(g.gross);
    g.vat = round2(g.vat);
  }
  for (const t of Object.values(report.byTerminal)) t.total = round2(t.total);

  report.topItems = Array.from(itemCounts, ([itemId, { name, count }]) => ({
    itemId,
    name,
    count,
  }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return report;
}

/** Days (Berlin) with at least one counted sale, ascending. */
export function getBookingDays(): BookingDay[] {
  const counts = new Map<string, number>();
  for (const order of orders.values()) {
    if (!isSale(order) || order.cancelledByOrderId || !order.closedAt) continue;
    const day = berlinDay(order.closedAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts, ([day, orderCount]) => ({ day, orderCount })).sort(
    (a, b) => a.day.localeCompare(b.day),
  );
}

export function listTransactions(f: {
  from: string;
  to: string;
  status?: "all" | "closed" | "cancelled";
  terminal?: string;
  search?: string;
}): TransactionRecord[] {
  const search = f.search?.toLowerCase();
  const result: { at: Date; record: TransactionRecord }[] = [];

  for (const o of orders.values()) {
    if (o.status !== "closed" || o.discarded) continue;
    const at = effectiveTime(o);
    if (!at || !inRange(at, f.from, f.to)) continue;

    const status =
      o.cancelsOrderId || o.cancelledByOrderId ? "cancelled" : "closed";
    if (f.status && f.status !== "all" && status !== f.status) continue;
    if (f.terminal && o.terminalId !== f.terminal) continue;

    const items = o.items.map((i) => `${i.qty}x ${i.name}`).join(", ");
    if (
      search &&
      !o.id.toLowerCase().includes(search) &&
      !items.toLowerCase().includes(search)
    ) {
      continue;
    }

    result.push({
      at,
      record: {
        orderId: o.id,
        terminalId: o.terminalId,
        items,
        itemCount: o.items.length,
        totalGross: o.totalGross,
        totalVat: sumVat(o.totalVat),
        status,
        title: o.title,
        cancelsOrderId: o.cancelsOrderId,
        closedAt: at.toISOString(),
      },
    });
  }

  result.sort((a, b) => b.at.getTime() - a.at.getTime());
  return result.map((r) => r.record);
}
