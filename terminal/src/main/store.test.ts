import { mkdtemp, readFile, rm, appendFile, access, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormatTooNewError } from "./migrations";
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

describe("LocalStore.migrate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pos-terminal-migrate-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  });

  const formatFile = () => join(dir, "format.json");
  const diskFormat = async () => (JSON.parse(await readFile(formatFile(), "utf8")) as { format: number }).format;

  it("missing format.json counts as format 1 and is written", async () => {
    const store = new LocalStore(dir);
    await store.migrate();
    expect(await store.format()).toBe(1);
    expect(JSON.parse(await readFile(formatFile(), "utf8"))).toEqual({ format: 1 });
  });

  it("higher format is refused without touching files", async () => {
    const store = new LocalStore(dir);
    await store.appendEvents([event("o1")]);
    await writeFile(formatFile(), JSON.stringify({ format: 2 }));
    const read = () => Promise.all(["format.json", "events.jsonl"].map((f) => readFile(join(dir, f))));
    const before = await read();
    await expect(store.migrate()).rejects.toBeInstanceOf(FormatTooNewError);
    expect(await read()).toEqual(before);
  });

  it("runs migrations in order and bumps format after each", async () => {
    const store = new LocalStore(dir);
    const calls: string[] = [];
    const step = (from: number) => async () => {
      calls.push(`from${from}:disk=${await diskFormat().catch(() => "none")}`);
    };
    await store.migrate([{ from: 2, run: step(2) }, { from: 1, run: step(1) }], 3);
    expect(calls).toEqual(["from1:disk=none", "from2:disk=2"]);
    expect(await diskFormat()).toBe(3);
    expect(await store.format()).toBe(3);
  });

  it("failed migration leaves format at the last completed step", async () => {
    const store = new LocalStore(dir);
    await expect(
      store.migrate([
        { from: 1, run: async () => {} },
        { from: 2, run: async () => { throw new Error("boom"); } },
      ], 3),
    ).rejects.toThrow("boom");
    expect(await diskFormat()).toBe(2);
  });

  it("a format stamp that cannot be written is logged and migrate still resolves", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await chmod(dir, 0o500); // read-only: format.json cannot be created
    const store = new LocalStore(dir);
    await expect(store.migrate()).resolves.toBeUndefined();
    expect(await exists(formatFile())).toBe(false);
    expect(error).toHaveBeenCalledOnce();
    expect(await store.format()).toBe(1);
  });

  it("a format bump that cannot be written after a migration step still rejects", async () => {
    const store = new LocalStore(dir);
    await expect(
      store.migrate([{ from: 1, run: async (d) => { await chmod(d, 0o500); } }], 2),
    ).rejects.toThrow();
    expect(await exists(formatFile())).toBe(false);
  });

  it("a populated v0.1.0 data dir (no format.json) is stamped with format 1 and left untouched", async () => {
    const events = [
      { seq: 1, orderId: "o1", type: "OrderOpened", data: { id: "o1", terminalId: "t1" }, occurredAt: "2026-10-01T10:00:00.000Z" },
      { seq: 2, orderId: "o1", type: "OrderClosed", data: { orderId: "o1" }, occurredAt: "2026-10-01T10:01:00.000Z" },
    ];
    const settings = {
      serverUrl: "http://kasse.local:3001", terminalId: "t1", terminalKey: "geheim", changeCalculator: false,
      printer: null, paperWidth: "80", lastCatalogFetchAt: "2026-10-01T09:00:00.000Z", clockSkewMs: 120,
    };
    const files: Record<string, string> = {
      "events.jsonl": events.map((e) => JSON.stringify(e) + "\n").join(""),
      "synced.jsonl": JSON.stringify({ orderId: "o1", syncedAt: "2026-10-01T11:00:00.000Z" }) + "\n",
      "catalog.json": JSON.stringify(catalog, null, 2),
      "settings.json": JSON.stringify(settings, null, 2),
    };
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    const before = await Promise.all(Object.keys(files).map((f) => readFile(join(dir, f))));

    const store = new LocalStore(dir);
    await store.migrate();

    expect(await Promise.all(Object.keys(files).map((f) => readFile(join(dir, f))))).toEqual(before);
    expect(JSON.parse(await readFile(formatFile(), "utf8"))).toEqual({ format: 1 });
    const reopened = new LocalStore(dir);
    expect(await reopened.readEvents()).toEqual(events);
    expect(await reopened.loadSettings()).toEqual(settings);
    expect(await reopened.loadCatalog()).toEqual(catalog);
    expect(await reopened.readSynced()).toEqual({ o1: "2026-10-01T11:00:00.000Z" });
  });

  it.each([
    ["invalid JSON", "{kaputt"],
    ["a non-numeric format", JSON.stringify({ format: "x" })],
    ["format 0", JSON.stringify({ format: 0 })],
  ])("a format.json with %s makes migrate throw", async (_name, content) => {
    await writeFile(formatFile(), content);
    await expect(new LocalStore(dir).migrate()).rejects.toThrow(/format\.json/);
    expect(await readFile(formatFile(), "utf8")).toBe(content);
  });

  it("a missing migration step throws and leaves format.json at the last completed step", async () => {
    const store = new LocalStore(dir);
    await expect(store.migrate([{ from: 1, run: async () => {} }], 3)).rejects.toThrow("no migration from format 2");
    expect(await diskFormat()).toBe(2);
  });
});
