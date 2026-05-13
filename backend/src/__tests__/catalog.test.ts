import { describe, it, expect, vi } from "vitest";

vi.mock("../eventstore/client", () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
  initEventStore: vi.fn().mockResolvedValue(undefined),
  readStream: vi.fn().mockResolvedValue([]),
  subscribeToAll: vi.fn(),
  replayAll: vi.fn().mockResolvedValue(undefined),
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [{ count: "0" }] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
    on: vi.fn(),
  }),
}));

vi.mock("../config", () => ({
  config: {
    port: 3001,
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
    receiptPdfDir: "/tmp/test",
  },
}));

vi.mock("../projections/runner", () => ({
  registerProjection: vi.fn(),
  startProjections: vi.fn().mockResolvedValue(undefined),
}));

import { appendEvent } from "../eventstore/client";
import { createItemGroup, archiveItem } from "../modules/catalog/catalog.commands";
import { items, groups, initCatalogProjections } from "../modules/catalog/catalog.projections";
import { registerProjection } from "../projections/runner";

describe("Catalog Commands", () => {
  it("creates an item group and writes event", async () => {
    const id = await createItemGroup("Hot Drinks", 19);
    expect(id).toBeTruthy();
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.stringContaining("catalog-"),
      "ItemGroupCreated",
      expect.objectContaining({ name: "Hot Drinks", vatRate: 19 })
    );
  });

  it("archives an item (never deletes)", async () => {
    await archiveItem("item-1");
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      "catalog-item-1",
      "ItemArchived",
      { id: "item-1" }
    );
  });
});

describe("Catalog Projections", () => {
  it("builds groups and items from events, archives items", () => {
    groups.clear();
    items.clear();

    initCatalogProjections();
    const m = vi.mocked(registerProjection);
    const handler = m.mock.calls[0][2];

    handler({ type: "ItemGroupCreated", data: { id: "g1", name: "Drinks", vatRate: 19 } }, "catalog-g1");
    expect(groups.get("g1")).toEqual({ id: "g1", name: "Drinks", vatRate: 19, archived: false });

    handler({ type: "ItemCreated", data: { id: "i1", name: "Espresso", groupId: "g1", price: 2.50 } }, "catalog-i1");
    expect(items.get("i1")!.price).toBe(2.50);

    handler({ type: "ItemArchived", data: { id: "i1" } }, "catalog-i1");
    expect(items.get("i1")!.archived).toBe(true);
  });

  it("archived items are still in projection (never deleted)", () => {
    groups.clear();
    items.clear();

    initCatalogProjections();
    const m = vi.mocked(registerProjection);
    const handler = m.mock.calls[m.mock.calls.length - 1][2];

    handler({ type: "ItemCreated", data: { id: "i2", name: "Latte", groupId: "g1", price: 3.0 } }, "catalog-i2");
    handler({ type: "ItemArchived", data: { id: "i2" } }, "catalog-i2");
    expect(items.has("i2")).toBe(true);
    expect(items.get("i2")!.archived).toBe(true);
  });
});
