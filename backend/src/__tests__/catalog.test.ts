import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    port: 3001,
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
    receiptPdfDir: "/tmp/test",
  },
}));

import { listGroups, createGroup, listItems, createItem, deleteItem } from "../modules/catalog/catalog.repository";

describe("Catalog Repository", () => {
  it("listGroups returns empty array when no rows", async () => {
    const result = await listGroups();
    expect(result).toEqual([]);
  });

  it("createGroup returns an id", async () => {
    const id = await createGroup("Hot Drinks", 19);
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("listItems returns empty array when no rows", async () => {
    const result = await listItems();
    expect(result).toEqual([]);
  });

  it("createItem returns an id", async () => {
    const id = await createItem("Espresso", "g1", 2.50);
    expect(id).toBeTruthy();
  });

  it("deleteItem does not throw", async () => {
    await expect(deleteItem("i1")).resolves.toBeUndefined();
  });
});
