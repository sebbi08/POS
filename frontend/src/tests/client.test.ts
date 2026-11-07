import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";

/** A failed response without a JSON body and without a status text. */
const failing = () => vi.fn(async () => new Response("<html>", { status: 502, statusText: "" }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("api client", () => {
  it("falls back to a German error text for requests, uploads and downloads", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", failing());
    await expect(api.get("/x")).rejects.toThrow("Anfrage fehlgeschlagen");
    await expect(api.upload("/x", new File(["a"], "a.csv"))).rejects.toThrow("Anfrage fehlgeschlagen");
    await expect(api.downloadCsv("/x")).rejects.toThrow("Anfrage fehlgeschlagen");
  });
});
