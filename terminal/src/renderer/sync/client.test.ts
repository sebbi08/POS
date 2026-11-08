import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncError, fetchCatalog, listTerminals, normalizeServerUrl, uploadAll } from "./client";
import type { TerminalSettings } from "../../shared/types";
import type { BookingUpload } from "../../shared/contract";

const settings: TerminalSettings = {
  serverUrl: "http://srv.local:3000/", terminalId: "t1", terminalKey: "key1",
  changeCalculator: false, printer: null, paperWidth: "80", lastCatalogFetchAt: null, clockSkewMs: null,
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const auth = { pin: "1234", appVersion: "0.2.0" };
const uploads = (n: number): BookingUpload[] => Array.from({ length: n }, (_, i) => ({ orderId: `o${i}`, events: [] }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("normalizeServerUrl", () => {
  it("trims, adds https and strips trailing slashes", () => {
    expect(normalizeServerUrl("  srv.example.de// ")).toBe("https://srv.example.de");
    expect(normalizeServerUrl("http://10.0.0.5:3000/")).toBe("http://10.0.0.5:3000");
    expect(normalizeServerUrl("https://a.b")).toBe("https://a.b");
  });
});

describe("listTerminals", () => {
  it("calls the normalized public URL and returns id/name", async () => {
    fetchMock.mockResolvedValue(json(200, [{ id: "t1", name: "Kasse 1", groupIds: [], printPickupReceipts: false }]));
    expect(await listTerminals("srv.de/")).toEqual([{ id: "t1", name: "Kasse 1" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://srv.de/api/terminals");
  });
});

describe("fetchCatalog", () => {
  it("sends terminal headers and returns skew", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    fetchMock.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-01-01T12:00:02.000Z")); // midpoint 12:00:01
      return json(200, { serverTime: "2026-01-01T12:00:11.000Z" });
    });
    const r = await fetchCatalog(settings, auth);
    expect(r.clockSkewMs).toBe(10_000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://srv.local:3000/api/sync/catalog");
    expect(init.headers).toMatchObject({ "x-terminal-id": "t1", "x-terminal-key": "key1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("maps 401 to German key error", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "Terminal-Schlüssel ungültig" }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten");
  });
  it("network error maps to Server nicht erreichbar", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Server nicht erreichbar");
  });
  it("timeout abort maps to Server nicht erreichbar", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(fetchCatalog(settings, auth)).rejects.toBeInstanceOf(SyncError);
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Server nicht erreichbar");
  });
  it("500 maps to Serverfehler (500)", async () => {
    fetchMock.mockResolvedValue(json(500, { error: "Serverfehler" }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Serverfehler (500)");
  });
});

describe("uploadAll", () => {
  it("sends 120 orders in 3 batches of max 50", async () => {
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { orders: BookingUpload[] };
      return json(200, { serverTime: new Date().toISOString(), accepted: body.orders.map((o) => o.orderId), rejected: [] });
    });
    const r = await uploadAll(settings, uploads(120), auth);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).orders.length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "x-terminal-id": "t1", "x-terminal-key": "key1" });
    expect(r.accepted).toHaveLength(120);
    expect(typeof r.clockSkewMs).toBe("number");
  });
  it("makes no request for empty uploads and reports null skew", async () => {
    expect(await uploadAll(settings, [], auth)).toEqual({ accepted: [], rejected: [], clockSkewMs: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("collects rejected orders", async () => {
    fetchMock.mockResolvedValue(json(200, { serverTime: new Date().toISOString(), accepted: ["o0"], rejected: [{ orderId: "o1", error: "kaputt" }] }));
    const r = await uploadAll(settings, uploads(2), auth);
    expect(r.rejected).toEqual([{ orderId: "o1", error: "kaputt" }]);
  });
  it("failure on batch 2 exposes batch-1 accepted and rejected in partial", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { serverTime: new Date().toISOString(), accepted: ["o0", "o1"], rejected: [{ orderId: "o2", error: "x" }] }))
      .mockResolvedValueOnce(json(500, { error: "Serverfehler" }));
    const err = await uploadAll(settings, uploads(60), auth).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err.message).toBe("Serverfehler (500)");
    expect(err.partial).toEqual({ accepted: ["o0", "o1"], rejected: [{ orderId: "o2", error: "x" }] });
  });
});

describe("PIN and version", () => {
  it("fetchCatalog sends x-admin-pin and x-terminal-version", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await fetchCatalog(settings, auth);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "x-admin-pin": "1234", "x-terminal-version": "0.2.0" });
  });
  it("401 Admin-PIN falsch maps to PIN text, other 401 to key text", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: "Admin-PIN falsch" }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow(/^Admin-PIN falsch$/);
    fetchMock.mockResolvedValueOnce(json(401, { error: "Terminal-Schlüssel ungültig" }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten");
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 401 }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten");
  });
  it("429 maps to server lock text", async () => {
    const lock = "Zu viele falsche PIN-Versuche – bitte in 5 Minuten erneut versuchen";
    fetchMock.mockResolvedValueOnce(json(429, { error: "custom lock" }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow(/^custom lock$/);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow(lock);
  });
  it("409 maps to version text using serverVersion", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: "Versionen passen nicht zusammen", serverVersion: "0.3.0" }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow("Kasse ist veraltet (Kasse 0.2.0, Server 0.3.0)");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 409 }));
    await expect(fetchCatalog(settings, auth)).rejects.toThrow(/^Versionen passen nicht zusammen$/);
  });
  it("uploadAll sends the same PIN in every batch and keeps partial on 401 in batch 2", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { serverTime: new Date().toISOString(), accepted: ["o0"], rejected: [] }))
      .mockResolvedValueOnce(json(401, { error: "Admin-PIN falsch" }));
    const err = await uploadAll(settings, uploads(60), auth).catch((e) => e);
    expect(err.message).toBe("Admin-PIN falsch");
    expect(err.partial).toEqual({ accepted: ["o0"], rejected: [] });
    for (const c of fetchMock.mock.calls) expect(c[1].headers).toMatchObject({ "x-admin-pin": "1234", "x-terminal-version": "0.2.0" });
    expect(JSON.stringify(err)).not.toContain("1234");
    expect(err.message).not.toContain("1234");
  });
});
