import { describe, expect, it } from "vitest";
import type { LocalEvent, NewEvent } from "../../shared/types";
import { cmdAddItem, cmdCancel, cmdCheckout, cmdDiscard, openOrderOf, projectOrders } from "./orders";
import { cancellableOrders, pendingUploads, unsyncedCount } from "./sync-selection";

const NOW = "2026-11-07T10:00:00.000Z";
const item = { id: "i1", name: "Bier", groupId: "g1", price: 2.5 };
const g = { id: "g1", name: "Getränke", vatRate: 19 };
let seq = 0;
let n = 0;
const newId = () => `o${++n}`;
const persist = (ev: NewEvent[]): LocalEvent[] => ev.map((e) => ({ ...e, seq: ++seq }));

function sale(log: LocalEvent[]): string {
  log.push(...persist(cmdAddItem(openOrderOf(projectOrders(log)), "T1", item, g, NOW, newId)));
  const o = openOrderOf(projectOrders(log))!;
  log.push(...persist(cmdCheckout(o, true, NOW)));
  return o.id;
}

describe("sync selection", () => {
  it("pendingUploads excludes open and synced orders and keeps original before its cancellation", () => {
    const log: LocalEvent[] = [];
    const a = sale(log);
    const b = sale(log);
    log.push(...persist(cmdCancel(projectOrders(log).get(a)!, NOW, newId)));
    const cancelId = [...projectOrders(log).values()].find((o) => o.cancelsOrderId)!.id;
    log.push(...persist(cmdAddItem(undefined, "T1", item, g, NOW, newId))); // open order
    const orders = projectOrders(log);

    const all = pendingUploads(log, orders, {});
    expect(all.map((u) => u.orderId)).toEqual([a, b, cancelId]);
    expect(all[0].events.map((e) => e.type)).toEqual(["OrderOpened", "ItemAdded", "FinalReceiptPrinted", "PickupReceiptPrinted", "OrderClosed"]);
    expect(all[2].events.map((e) => e.type)).toEqual(["OrderCancellationCreated"]);
    expect(Object.keys(all[0].events[0])).toEqual(["type", "data", "occurredAt"]);

    const some = pendingUploads(log, orders, { [a]: NOW });
    expect(some.map((u) => u.orderId)).toEqual([b, cancelId]);
    expect(unsyncedCount(orders, { [a]: NOW })).toBe(2);
  });

  it("incomplete (crashed) order is never pending", () => {
    const log: LocalEvent[] = [];
    log.push(...persist(cmdAddItem(undefined, "T1", item, g, NOW, newId)));
    const o = openOrderOf(projectOrders(log))!;
    log.push(...persist(cmdCheckout(o, true, NOW).slice(0, 2)));
    const orders = projectOrders(log);
    expect(pendingUploads(log, orders, {})).toEqual([]);
    expect(unsyncedCount(orders, {})).toBe(0);
  });

  it("cancellableOrders excludes synced, discarded, cancelled and cancellation orders", () => {
    const log: LocalEvent[] = [];
    const synced = sale(log);
    const cancelled = sale(log);
    const ok = sale(log);
    log.push(...persist(cmdAddItem(undefined, "T1", item, g, NOW, newId)));
    const d = openOrderOf(projectOrders(log))!;
    log.push(...persist(cmdDiscard(d, NOW)));
    log.push(...persist(cmdCancel(projectOrders(log).get(cancelled)!, NOW, newId)));
    const orders = projectOrders(log);
    const res = cancellableOrders(orders, { [synced]: NOW }).map((o) => o.id);
    expect(res).toEqual([ok]);
  });
});
