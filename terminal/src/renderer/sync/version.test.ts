import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareVersions, versionMismatchText, checkServerVersion } from "./version";
import { SyncError } from "./client";

describe("compareVersions", () => {
  it("compares numerically per part", () => {
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
  });
  it("returns null for unreadable versions", () => {
    expect(compareVersions("0.2.0-rc1", "0.2.0")).toBeNull();
    expect(compareVersions("0.2.0", "abc")).toBeNull();
  });
});

describe("versionMismatchText", () => {
  it("is null for equal versions", () => {
    expect(versionMismatchText("0.2.0", "0.2.0")).toBeNull();
  });
  it("terminal older", () => {
    expect(versionMismatchText("0.2.0", "0.3.0")).toBe("Kasse ist veraltet (Kasse 0.2.0, Server 0.3.0) – bitte App beenden und neu starten, damit das Update installiert wird");
  });
  it("terminal newer", () => {
    expect(versionMismatchText("0.3.0", "0.2.0")).toBe("Server ist veraltet (Server 0.2.0, Kasse 0.3.0) – bitte zuerst den Server aktualisieren");
  });
  it("unreadable", () => {
    expect(versionMismatchText("0.2.0", "weird")).toBe("Versionen passen nicht zusammen");
  });
});

describe("checkServerVersion", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("resolves on equal version and calls /api/version", async () => {
    fetchMock.mockResolvedValue(json(200, { version: "0.2.0" }));
    await expect(checkServerVersion("srv.de/", "0.2.0")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("https://srv.de/api/version");
  });
  it("throws the mismatch text", async () => {
    fetchMock.mockResolvedValue(json(200, { version: "0.3.0" }));
    await expect(checkServerVersion("srv.de", "0.2.0")).rejects.toThrow("Kasse ist veraltet (Kasse 0.2.0, Server 0.3.0) – bitte App beenden und neu starten, damit das Update installiert wird");
  });
  it("network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("x"));
    const e = await checkServerVersion("srv.de", "0.2.0").catch((x) => x);
    expect(e).toBeInstanceOf(SyncError);
    expect(e.message).toBe("Server nicht erreichbar");
  });
  it("non-2xx and missing version", async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    await expect(checkServerVersion("srv.de", "0.2.0")).rejects.toThrow("Serverfehler (500)");
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await expect(checkServerVersion("srv.de", "0.2.0")).rejects.toThrow("Versionen passen nicht zusammen");
  });
});
