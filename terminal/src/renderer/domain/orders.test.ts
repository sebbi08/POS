import { describe, expect, it } from "vitest";
import type { CatalogGroup, CatalogItem, LocalEvent, NewEvent } from "../../shared/types";
import {
  cmdAddItem, cmdCancel, cmdChangeQty, cmdCheckout, cmdDiscard, cmdRemoveLine,
  lastPrintable, openOrderOf, projectOrders,
} from "./orders";

const item: CatalogItem = { id: "i1", name: "Bier", groupId: "g1", price: 2.5 };
const item2: CatalogItem = { id: "i2", name: "Wurst", groupId: "g2", price: 3 };
const g19: CatalogGroup = { id: "g1", name: "Getränke", vatRate: 19 };
const g7: CatalogGroup = { id: "g2", name: "Essen", vatRate: 7 };
const NOW = "2026-11-07T10:00:00.000Z";
let n = 0;
const newId = () => `id-${++n}`;

let seq = 0;
function persist(events: NewEvent[]): LocalEvent[] {
  return events.map((e) => ({ ...e, seq: ++seq }));
}

function closedSale(orderItems: [CatalogItem, CatalogGroup][] = [[item, g19]]) {
  const log: LocalEvent[] = [];
  for (const [it, g] of orderItems) {
    const order = openOrderOf(projectOrders(log));
    log.push(...persist(cmdAddItem(order, "T1", it, g, NOW, newId)));
  }
  const order = openOrderOf(projectOrders(log))!;
  log.push(...persist(cmdCheckout(order, false, NOW)));
  return { log, id: order.id };
}

describe("orders domain", () => {
  it("add, add same item, checkout → totals and VAT match backend rounding", () => {
    const log: LocalEvent[] = [];
    for (let i = 0; i < 3; i++) {
      log.push(...persist(cmdAddItem(openOrderOf(projectOrders(log)), "T1", item, g19, NOW, newId)));
    }
    expect(log.filter((e) => e.type === "OrderOpened")).toHaveLength(1);
    const open = openOrderOf(projectOrders(log))!;
    expect(open.lines).toHaveLength(1);
    expect(open.lines[0].qty).toBe(3);
    log.push(...persist(cmdCheckout(open, false, NOW)));
    const o = projectOrders(log).get(open.id)!;
    expect(o.status).toBe("closed");
    expect(o.totalGross).toBe(7.5);
    expect(o.totalVat).toEqual({ "19": 1.2 });
    expect(o.totalNet).toBe(6.3);
    expect(o.closedAt).toBe(NOW);
  });

  it("decrease qty 1 emits ItemRemoved", () => {
    const log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    const order = openOrderOf(projectOrders(log))!;
    const ev = cmdChangeQty(order, "i1", -1, NOW);
    expect(ev.map((e) => e.type)).toEqual(["ItemRemoved"]);
    const log2 = [...log, ...persist(ev)];
    expect(openOrderOf(projectOrders(log2))!.lines).toEqual([]);
  });

  it("change qty up and down on a multi-qty line", () => {
    let log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    log = [...log, ...persist(cmdChangeQty(openOrderOf(projectOrders(log))!, "i1", 1, NOW))];
    log = [...log, ...persist(cmdChangeQty(openOrderOf(projectOrders(log))!, "i1", 1, NOW))];
    log = [...log, ...persist(cmdChangeQty(openOrderOf(projectOrders(log))!, "i1", -1, NOW))];
    const line = openOrderOf(projectOrders(log))!.lines[0];
    expect(line.qty).toBe(2);
    expect(line.total).toBe(5);
    expect(line.vatAmount).toBe(0.8);
  });

  it("remove line and discard", () => {
    let log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    const order = openOrderOf(projectOrders(log))!;
    expect(cmdRemoveLine(order, "i1", NOW)[0].type).toBe("ItemRemoved");
    const ev = cmdDiscard(order, NOW);
    expect(ev).toHaveLength(1);
    expect(ev[0].data).toMatchObject({ cancelled: true, totalGross: 0, totalVat: {}, totalNet: 0 });
    log = [...log, ...persist(ev)];
    const o = projectOrders(log).get(order.id)!;
    expect(o.status).toBe("closed");
    expect(o.discarded).toBe(true);
    expect(lastPrintable(projectOrders(log))).toBeUndefined();
  });

  it("checkout without pickups emits no PickupReceiptPrinted, last event is OrderClosed", () => {
    const log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    const order = openOrderOf(projectOrders(log))!;
    const ev = cmdCheckout(order, false, NOW);
    expect(ev.map((e) => e.type)).toEqual(["FinalReceiptPrinted", "OrderClosed"]);
    expect(ev.every((e) => e.occurredAt === NOW)).toBe(true);
    const withPickups = cmdCheckout(order, true, NOW);
    expect(withPickups.map((e) => e.type)).toEqual(["FinalReceiptPrinted", "PickupReceiptPrinted", "OrderClosed"]);
    expect(withPickups[1].data).toEqual({ orderId: order.id, itemId: "i1" });
  });

  it("checkout of empty or closed order throws German error", () => {
    const log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    const order = openOrderOf(projectOrders(log))!;
    expect(() => cmdCheckout({ ...order, lines: [] }, false, NOW)).toThrow("Keine Artikel in der Bestellung");
    expect(() => cmdCheckout({ ...order, status: "closed" }, false, NOW)).toThrow(/nicht offen/);
  });

  it("events carry orderId and data.orderId (except OrderOpened)", () => {
    const ev = cmdAddItem(undefined, "T1", item, g19, NOW, () => "abc");
    expect(ev[0]).toMatchObject({ orderId: "abc", type: "OrderOpened", data: { id: "abc", terminalId: "T1" } });
    expect(ev[1].data).toMatchObject({ orderId: "abc", itemId: "i1", name: "Bier", qty: 1, unitPrice: 2.5, vatRate: 19, total: 2.5, vatAmount: 0.4 });
  });

  it("crash prefix: receipt printed but no OrderClosed stays open", () => {
    const log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    const order = openOrderOf(projectOrders(log))!;
    const prefix = persist(cmdCheckout(order, true, NOW).slice(0, 2));
    const o = projectOrders([...log, ...prefix]).get(order.id)!;
    expect(o.status).toBe("open");
  });

  it("cancel negates lines and links both orders after projection", () => {
    const { log, id } = closedSale([[item, g19], [item2, g7]]);
    const orders = projectOrders(log);
    const ev = cmdCancel(orders.get(id)!, NOW, () => "cancel-1");
    expect(ev).toHaveLength(1);
    expect(ev[0].orderId).toBe("cancel-1");
    const data = ev[0].data as any;
    expect(data.title).toBe(`Storno zu Bestellung #${id.slice(0, 8)}`);
    expect(data.items.map((i: any) => i.total)).toEqual([-2.5, -3]);
    expect(data.items[0].qty).toBe(-1);
    expect(data.totalGross).toBe(-5.5);
    expect(data.createdAt).toBe(NOW);
    expect(data.closedAt).toBe(NOW);
    const after = projectOrders([...log, ...persist(ev)]);
    expect(after.get(id)!.cancelledByOrderId).toBe("cancel-1");
    const c = after.get("cancel-1")!;
    expect(c.cancelsOrderId).toBe(id);
    expect(c.status).toBe("closed");
    expect(c.totalGross).toBe(-5.5);
    expect(c.totalVat).toEqual({ "19": -0.4, "7": -0.2 });
    expect(c.totalNet).toBe(-4.9);
    expect(c.openedAt).toBe(NOW);
    expect(c.closedAt).toBe(NOW);
    expect(lastPrintable(after)!.id).toBe("cancel-1");
  });

  it("cancel of an already cancelled order throws", () => {
    const { log, id } = closedSale();
    const log2 = [...log, ...persist(cmdCancel(projectOrders(log).get(id)!, NOW, () => "c1"))];
    const orders = projectOrders(log2);
    expect(() => cmdCancel(orders.get(id)!, NOW, newId)).toThrow();
    expect(() => cmdCancel(orders.get("c1")!, NOW, newId)).toThrow();
  });

  it("cancel of open or discarded order throws", () => {
    const log = persist(cmdAddItem(undefined, "T1", item, g19, NOW, newId));
    const open = openOrderOf(projectOrders(log))!;
    expect(() => cmdCancel(open, NOW, newId)).toThrow();
    const log2 = [...log, ...persist(cmdDiscard(open, NOW))];
    expect(() => cmdCancel(projectOrders(log2).get(open.id)!, NOW, newId)).toThrow();
  });

  it("lastPrintable picks closed order with highest firstSeq", () => {
    const a = closedSale();
    const b = closedSale();
    expect(lastPrintable(projectOrders([...a.log, ...b.log]))!.id).toBe(b.id);
  });
});
