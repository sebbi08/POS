import { mkdtemp, readFile, rm, appendFile, access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStore } from "./store";
import type { NewEvent } from "../shared/types";
import type { CatalogSnapshot } from "../shared/contract";

function event(orderId: string, type: NewEvent["type"] = "OrderOpened", data: Record<string, unknown> = {}): NewEvent {
  return { orderId, type, data, occurredAt: "2026-11-07T10:00:00.000Z" };
}

const catalog: CatalogSnapshot = {
  serverTime: "2026-11-07T10:00:00.000Z",
  terminal: { id: "t1", name: "Theke", printPickupReceipts: true },
  company: { name: "Verein", address: "Hauptstraße 1", city: "Berlin", vatId: "DE123" },
  groups: [{ id: "g1", name: "Getränke", vatRate: 19 }],
  items: [{ id: "i1", name: "Bier", groupId: "g1", price: 3.5 }],
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("LocalStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pos-terminal-store-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("appendEvents assigns increasing seq and readEvents returns them in order", async () => {
    const store = new LocalStore(dir);
    const first = await store.appendEvents([event("a"), event("a", "ItemAdded", { itemId: "i1" })]);
    const second = await store.appendEvents([event("b")]);

    expect(first.map((e) => e.seq)).toEqual([1, 2]);
    expect(second.map((e) => e.seq)).toEqual([3]);
    const all = await store.readEvents();
    expect(all).toEqual([
      { ...event("a"), seq: 1 },
      { ...event("a", "ItemAdded", { itemId: "i1" }), seq: 2 },
      { ...event("b"), seq: 3 },
    ]);
  });

  it("events survive a new LocalStore instance on the same dir", async () => {
    await new LocalStore(dir).appendEvents([event("a"), event("b")]);

    const reopened = new LocalStore(dir);
    expect((await reopened.readEvents()).map((e) => [e.orderId, e.seq])).toEqual([["a", 1], ["b", 2]]);
    const next = await reopened.appendEvents([event("c")]);
    expect(next[0].seq).toBe(3);
  });

  it("truncated last line is skipped, previous events kept", async () => {
    await new LocalStore(dir).appendEvents([event("a"), event("b")]);
    await appendFile(join(dir, "events.jsonl"), '{"orderId":"x","ty');
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const events = await new LocalStore(dir).readEvents();

    expect(events.map((e) => e.orderId)).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("appending after a truncated last line keeps the file readable", async () => {
    await new LocalStore(dir).appendEvents([event("a")]);
    await appendFile(join(dir, "events.jsonl"), '{"orderId":"x","ty');
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const store = new LocalStore(dir);
    const appended = await store.appendEvents([event("b")]);

    expect(appended[0].seq).toBe(2);
    expect((await store.readEvents()).map((e) => [e.orderId, e.seq])).toEqual([["a", 1], ["b", 2]]);
  });

  it("a complete last record without newline is kept and the next append starts a new line", async () => {
    await appendFile(join(dir, "events.jsonl"), JSON.stringify({ ...event("a"), seq: 1 }));

    const store = new LocalStore(dir);
    await store.appendEvents([event("b")]);

    expect((await new LocalStore(dir).readEvents()).map((e) => [e.orderId, e.seq])).toEqual([["a", 1], ["b", 2]]);
  });

  it("a corrupt line in the middle of the file throws with its line number", async () => {
    await writeFile(
      join(dir, "events.jsonl"),
      `${JSON.stringify({ ...event("a"), seq: 1 })}\nkaputt\n${JSON.stringify({ ...event("b"), seq: 2 })}\n`,
    );

    await expect(new LocalStore(dir).readEvents()).rejects.toThrow(/line 2/);
  });

  it("saveCatalog is atomic: no partial file left after write", async () => {
    const store = new LocalStore(dir);
    expect(await store.loadCatalog()).toBeNull();

    await store.saveCatalog(catalog);

    expect(await exists(join(dir, "catalog.json"))).toBe(true);
    expect(await exists(join(dir, "catalog.json.tmp"))).toBe(false);
    expect(JSON.parse(await readFile(join(dir, "catalog.json"), "utf8"))).toEqual(catalog);
    expect(await new LocalStore(dir).loadCatalog()).toEqual(catalog);
  });

  it("saveSettings and loadSettings round-trip", async () => {
    const store = new LocalStore(dir);
    expect(await store.loadSettings()).toBeNull();
    const settings = {
      serverUrl: "http://kasse.local:3001",
      terminalId: "t1",
      terminalKey: "geheim",
      changeCalculator: true,
      printer: { vendorId: 0x0416, productId: 0x5011, name: "POS-80" },
      paperWidth: "80" as const,
      lastCatalogFetchAt: null,
      clockSkewMs: null,
    };

    await store.saveSettings(settings);

    expect(await new LocalStore(dir).loadSettings()).toEqual(settings);
    expect(await exists(join(dir, "settings.json.tmp"))).toBe(false);
  });

  it("markSynced records syncedAt per order and readSynced returns them", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T12:00:00.000Z"), toFake: ["Date"] });
    try {
      const store = new LocalStore(dir);
      expect(await store.readSynced()).toEqual({});

      await store.markSynced(["a", "b"]);

      expect(await new LocalStore(dir).readSynced()).toEqual({
        a: "2026-11-07T12:00:00.000Z",
        b: "2026-11-07T12:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("readSynced skips a truncated last line", async () => {
    await new LocalStore(dir).markSynced(["a"]);
    await appendFile(join(dir, "synced.jsonl"), '{"orderId":"b","sync');
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(Object.keys(await new LocalStore(dir).readSynced())).toEqual(["a"]);
  });

  it("compact drops only orders synced more than 30 days ago", async () => {
    const now = new Date("2026-12-31T12:00:00.000Z");
    const day = 24 * 60 * 60 * 1000;
    await writeFile(
      join(dir, "synced.jsonl"),
      [
        { orderId: "old", syncedAt: new Date(now.getTime() - 31 * day).toISOString() },
        { orderId: "recent", syncedAt: new Date(now.getTime() - 29 * day).toISOString() },
      ]
        .map((l) => JSON.stringify(l) + "\n")
        .join(""),
    );
    const store = new LocalStore(dir);
    await store.appendEvents([event("old"), event("recent"), event("unsynced"), event("old", "OrderClosed")]);

    await store.compact(30, now);

    const remaining = await new LocalStore(dir).readEvents();
    expect(remaining.map((e) => [e.orderId, e.seq])).toEqual([["recent", 2], ["unsynced", 3]]);
    expect(await exists(join(dir, "events.jsonl.tmp"))).toBe(false);
  });

  it("an event line without a numeric seq counts as corrupt", async () => {
    await writeFile(
      join(dir, "events.jsonl"),
      `${JSON.stringify({ ...event("a"), seq: 1 })}\n${JSON.stringify(event("b"))}\n${JSON.stringify({ ...event("c"), seq: "3" })}\n`,
    );

    await expect(new LocalStore(dir).readEvents()).rejects.toThrow(/line 2/);
  });

  it("compact also removes the synced entries of the dropped orders", async () => {
    const now = new Date("2026-12-31T12:00:00.000Z");
    const day = 24 * 60 * 60 * 1000;
    const recentAt = new Date(now.getTime() - 29 * day).toISOString();
    await writeFile(
      join(dir, "synced.jsonl"),
      [
        { orderId: "old", syncedAt: new Date(now.getTime() - 31 * day).toISOString() },
        { orderId: "recent", syncedAt: recentAt },
      ]
        .map((l) => JSON.stringify(l) + "\n")
        .join(""),
    );
    const store = new LocalStore(dir);
    await store.appendEvents([event("old"), event("recent")]);

    await store.compact(30, now);

    expect(await new LocalStore(dir).readSynced()).toEqual({ recent: recentAt });
    expect(await exists(join(dir, "synced.jsonl.tmp"))).toBe(false);
  });

  it("seq keeps counting after compact in the same instance", async () => {
    const now = new Date("2026-12-31T12:00:00.000Z");
    await writeFile(
      join(dir, "synced.jsonl"),
      JSON.stringify({ orderId: "old", syncedAt: "2026-11-01T12:00:00.000Z" }) + "\n",
    );
    await new LocalStore(dir).appendEvents([event("keep"), event("old")]);

    const store = new LocalStore(dir);
    await store.compact(30, now);
    const next = await store.appendEvents([event("new")]);

    expect(next[0].seq).toBe(3);
    expect((await store.readEvents()).map((e) => [e.orderId, e.seq])).toEqual([["keep", 1], ["new", 3]]);
  });

  it("markSynced repairs a truncated last line of synced.jsonl before appending", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T12:00:00.000Z"), toFake: ["Date"] });
    try {
      await new LocalStore(dir).markSynced(["a"]);
      await appendFile(join(dir, "synced.jsonl"), '{"orderId":"x","sync');
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await new LocalStore(dir).markSynced(["b"]);

      expect(await new LocalStore(dir).readSynced()).toEqual({
        a: "2026-11-07T12:00:00.000Z",
        b: "2026-11-07T12:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("concurrent appendEvents calls do not interleave or duplicate seq", async () => {
    const store = new LocalStore(dir);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.appendEvents([event(`o${i}`)])),
    );

    expect(results.flat().map((e) => e.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    const stored = await new LocalStore(dir).readEvents();
    expect(stored.map((e) => e.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(stored.map((e) => e.orderId)).size).toBe(20);
  });
});
