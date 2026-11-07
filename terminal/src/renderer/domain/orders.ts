import type { CatalogGroup, CatalogItem, LocalEvent, NewEvent } from "../../shared/types";
import { round2, vatOf } from "./money";

export interface OrderLine { itemId: string; name: string; qty: number; unitPrice: number; vatRate: number; vatAmount: number; total: number }
export interface LocalOrder {
  id: string; terminalId: string; status: "open" | "closed"; discarded: boolean;
  lines: OrderLine[]; totalGross: number; totalVat: Record<string, number>; totalNet: number;
  openedAt: string; closedAt?: string; firstSeq: number;
  cancelsOrderId?: string; cancelledByOrderId?: string; title?: string;
}

/** Sums lines into gross / per-rate VAT / net, rounded like backend closeOrder. */
function totalsOf(lines: OrderLine[]) {
  const gross = lines.reduce((s, l) => s + l.total, 0);
  const vat: Record<string, number> = {};
  for (const l of lines) vat[String(l.vatRate)] = (vat[String(l.vatRate)] || 0) + l.vatAmount;
  const vatSum = Object.values(vat).reduce((a, b) => a + b, 0);
  return {
    totalGross: round2(gross),
    totalVat: Object.fromEntries(Object.entries(vat).map(([k, v]) => [k, round2(v)])),
    totalNet: round2(gross - vatSum),
  };
}

const neg = (x: number) => (x === 0 ? 0 : -x);

export function projectOrders(events: LocalEvent[]): Map<string, LocalOrder> {
  const orders = new Map<string, LocalOrder>();
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) {
    const d = e.data;
    switch (e.type) {
      case "OrderOpened": {
        const id = d.id as string;
        orders.set(id, {
          id, terminalId: d.terminalId as string, status: "open", discarded: false,
          lines: [], totalGross: 0, totalVat: {}, totalNet: 0,
          openedAt: e.occurredAt, firstSeq: e.seq,
        });
        break;
      }
      case "ItemAdded": {
        const o = orders.get(d.orderId as string);
        if (!o || o.status !== "open") break;
        const existing = o.lines.find((l) => l.itemId === d.itemId);
        if (existing) {
          existing.qty += d.qty as number;
          existing.total = round2(existing.total + (d.total as number));
          existing.vatAmount = round2(existing.vatAmount + (d.vatAmount as number));
        } else {
          o.lines.push({
            itemId: d.itemId as string, name: d.name as string, qty: d.qty as number,
            unitPrice: d.unitPrice as number, vatRate: d.vatRate as number,
            vatAmount: d.vatAmount as number, total: d.total as number,
          });
        }
        Object.assign(o, totalsOf(o.lines));
        break;
      }
      case "ItemRemoved": {
        const o = orders.get(d.orderId as string);
        if (!o || o.status !== "open") break;
        o.lines = o.lines.filter((l) => l.itemId !== d.itemId);
        Object.assign(o, totalsOf(o.lines));
        break;
      }
      case "OrderClosed": {
        const o = orders.get(d.orderId as string);
        if (!o || o.status !== "open") break;
        o.status = "closed";
        o.totalGross = d.totalGross as number;
        o.totalVat = d.totalVat as Record<string, number>;
        o.totalNet = d.totalNet as number;
        o.closedAt = e.occurredAt;
        o.discarded = d.cancelled === true;
        break;
      }
      case "OrderCancellationCreated": {
        const id = d.id as string;
        orders.set(id, {
          id, terminalId: d.terminalId as string, status: "closed", discarded: false,
          lines: (d.items as OrderLine[]).map((l) => ({ ...l })),
          totalGross: d.totalGross as number,
          totalVat: d.totalVat as Record<string, number>,
          totalNet: d.totalNet as number,
          openedAt: e.occurredAt, closedAt: e.occurredAt, firstSeq: e.seq,
          cancelsOrderId: d.cancelsOrderId as string, title: d.title as string,
        });
        const original = orders.get(d.cancelsOrderId as string);
        if (original) original.cancelledByOrderId = id;
        break;
      }
      // FinalReceiptPrinted / PickupReceiptPrinted do not change the projection.
    }
  }
  return orders;
}

export function openOrderOf(orders: Map<string, LocalOrder>): LocalOrder | undefined {
  for (const o of orders.values()) if (o.status === "open") return o;
  return undefined;
}

function itemAdded(orderId: string, line: OrderLine, qty: number, now: string): NewEvent {
  const total = round2(line.unitPrice * qty);
  return {
    orderId, type: "ItemAdded", occurredAt: now,
    data: {
      orderId, itemId: line.itemId, name: line.name, qty,
      unitPrice: line.unitPrice, vatRate: line.vatRate,
      vatAmount: vatOf(total, line.vatRate), total,
    },
  };
}

export function cmdAddItem(order: LocalOrder | undefined, terminalId: string, item: CatalogItem, group: CatalogGroup, now: string, newId: () => string): NewEvent[] {
  const events: NewEvent[] = [];
  let orderId: string;
  if (order) {
    orderId = order.id;
  } else {
    orderId = newId();
    events.push({ orderId, type: "OrderOpened", data: { id: orderId, terminalId }, occurredAt: now });
  }
  const line: OrderLine = {
    itemId: item.id, name: item.name, qty: 1, unitPrice: item.price,
    vatRate: group.vatRate, vatAmount: 0, total: 0,
  };
  events.push(itemAdded(orderId, line, 1, now));
  return events;
}

function requireOpenLine(order: LocalOrder, itemId: string): OrderLine {
  if (order.status !== "open") throw new Error("Bestellung ist nicht offen");
  const line = order.lines.find((l) => l.itemId === itemId);
  if (!line) throw new Error("Artikel nicht in der Bestellung");
  return line;
}

export function cmdChangeQty(order: LocalOrder, itemId: string, delta: 1 | -1, now: string): NewEvent[] {
  const line = requireOpenLine(order, itemId);
  if (delta === -1 && line.qty <= 1) return cmdRemoveLine(order, itemId, now);
  return [itemAdded(order.id, line, delta, now)];
}

export function cmdRemoveLine(order: LocalOrder, itemId: string, now: string): NewEvent[] {
  requireOpenLine(order, itemId);
  return [{ orderId: order.id, type: "ItemRemoved", data: { orderId: order.id, itemId }, occurredAt: now }];
}

export function cmdDiscard(order: LocalOrder, now: string): NewEvent[] {
  if (order.status !== "open") throw new Error("Bestellung ist nicht offen");
  return [{
    orderId: order.id, type: "OrderClosed", occurredAt: now,
    data: { orderId: order.id, totalGross: 0, totalVat: {}, totalNet: 0, cancelled: true },
  }];
}

export function cmdCheckout(order: LocalOrder, printPickups: boolean, now: string): NewEvent[] {
  if (order.status !== "open") throw new Error("Bestellung ist nicht offen");
  if (order.lines.length === 0) throw new Error("Keine Artikel in der Bestellung");
  const id = order.id;
  const events: NewEvent[] = [{ orderId: id, type: "FinalReceiptPrinted", data: { orderId: id }, occurredAt: now }];
  if (printPickups) {
    for (const l of order.lines) {
      events.push({ orderId: id, type: "PickupReceiptPrinted", data: { orderId: id, itemId: l.itemId }, occurredAt: now });
    }
  }
  events.push({
    orderId: id, type: "OrderClosed", occurredAt: now,
    data: { orderId: id, ...totalsOf(order.lines) },
  });
  return events;
}

export function cmdCancel(original: LocalOrder, now: string, newId: () => string): NewEvent[] {
  if (original.status !== "closed") throw new Error("Nur abgeschlossene Bestellungen können storniert werden");
  if (original.discarded) throw new Error("Verworfene Bestellung kann nicht storniert werden");
  if (original.cancelledByOrderId) throw new Error("Bestellung bereits storniert");
  if (original.cancelsOrderId) throw new Error("Eine Stornobuchung kann nicht storniert werden");
  const id = newId();
  return [{
    orderId: id, type: "OrderCancellationCreated", occurredAt: now,
    data: {
      id, terminalId: original.terminalId,
      title: `Storno zu Bestellung #${original.id.slice(0, 8)}`,
      cancelsOrderId: original.id,
      items: original.lines.map((l) => ({ ...l, qty: neg(l.qty), total: neg(l.total), vatAmount: neg(l.vatAmount) })),
      totalGross: neg(original.totalGross),
      totalVat: Object.fromEntries(Object.entries(original.totalVat).map(([k, v]) => [k, neg(v)])),
      totalNet: neg(original.totalNet),
      createdAt: now, closedAt: now,
    },
  }];
}

export function lastPrintable(orders: Map<string, LocalOrder>): LocalOrder | undefined {
  let best: LocalOrder | undefined;
  for (const o of orders.values()) {
    if (o.status !== "closed" || o.discarded) continue;
    if (!best || o.firstSeq > best.firstSeq) best = o;
  }
  return best;
}
