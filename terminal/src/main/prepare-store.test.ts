import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_PREPARE_ERROR, prepareStore } from "./prepare-store";
import { LocalStore } from "./store";

const NOW = new Date("2026-11-08T12:00:00.000Z");

describe("prepareStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pos-terminal-prepare-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  });

  it("a usable store yields no error", async () => {
    expect(await prepareStore(new LocalStore(dir), NOW)).toBeNull();
  });

  it("a format stamp that cannot be written does not block the till", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await chmod(dir, 0o500); // read-only: format.json cannot be created
    expect(await prepareStore(new LocalStore(dir), NOW)).toBeNull();
    expect(await readdir(dir)).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("a newer format blocks with its own message and is not compacted", async () => {
    await writeFile(join(dir, "format.json"), JSON.stringify({ format: 2 }));
    const store = new LocalStore(dir);
    const compact = vi.spyOn(store, "compact");
    expect(await prepareStore(store, NOW)).toBe("Lokale Daten stammen von einer neueren Version – bitte aktuelle Version installieren");
    expect(compact).not.toHaveBeenCalled();
  });

  it("an invalid format.json blocks with the generic message and is not compacted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await writeFile(join(dir, "format.json"), "kaputt");
    const store = new LocalStore(dir);
    const compact = vi.spyOn(store, "compact");
    expect(await prepareStore(store, NOW)).toBe(STORE_PREPARE_ERROR);
    expect(compact).not.toHaveBeenCalled();
  });

  it("a failing compact does not block the till", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new LocalStore(dir);
    vi.spyOn(store, "compact").mockRejectedValue(new Error("disk"));
    expect(await prepareStore(store, NOW)).toBeNull();
  });
});
