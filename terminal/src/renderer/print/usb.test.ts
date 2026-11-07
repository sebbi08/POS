import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintError, printJobs } from "./usb";

const printer = { vendorId: 1, productId: 2, name: "Epson" };

function fakeDevice(over: Record<string, unknown> = {}) {
  return {
    vendorId: 1, productId: 2,
    open: vi.fn().mockResolvedValue(undefined),
    selectConfiguration: vi.fn().mockResolvedValue(undefined),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    transferOut: vi.fn().mockResolvedValue({ status: "ok" }),
    close: vi.fn().mockResolvedValue(undefined),
    configuration: { interfaces: [{ interfaceNumber: 0, alternate: { endpoints: [{ direction: "out", endpointNumber: 3 }] } }] },
    ...over,
  };
}

function mockUsb(devices: unknown[]) {
  Object.defineProperty(navigator, "usb", { configurable: true, value: { getDevices: vi.fn().mockResolvedValue(devices) } });
}

afterEach(() => { Reflect.deleteProperty(navigator, "usb"); });

describe("printJobs", () => {
  it("fails without a configured printer", async () => {
    await expect(printJobs(null, [new Uint8Array([1])])).rejects.toThrow(new PrintError("Kein Drucker eingerichtet"));
  });

  it("reports a missing device", async () => {
    mockUsb([]);
    await expect(printJobs(printer, [new Uint8Array([1])])).rejects.toThrow(
      "Drucker nicht gefunden – ist er eingeschaltet und angeschlossen?");
  });

  it("sends every job to the OUT endpoint and closes the device", async () => {
    const dev = fakeDevice();
    mockUsb([{ vendorId: 9, productId: 9 }, dev]);
    await printJobs(printer, [new Uint8Array([1]), new Uint8Array([2])]);
    expect(dev.transferOut).toHaveBeenCalledTimes(2);
    expect(dev.transferOut).toHaveBeenCalledWith(3, new Uint8Array([1]));
    expect(dev.close).toHaveBeenCalledTimes(1);
  });

  it("maps other failures and still closes the device", async () => {
    const dev = fakeDevice({ transferOut: vi.fn().mockRejectedValue(new Error("boom")) });
    mockUsb([dev]);
    await expect(printJobs(printer, [new Uint8Array([1])])).rejects.toThrow("Drucken fehlgeschlagen: boom");
    expect(dev.close).toHaveBeenCalledTimes(1);
  });

  it("fails when transferOut reports a non-ok status", async () => {
    const dev = fakeDevice({ transferOut: vi.fn().mockResolvedValue({ status: "stall" }) });
    mockUsb([dev]);
    await expect(printJobs(printer, [new Uint8Array([1])])).rejects.toThrow("Drucken fehlgeschlagen: stall");
    expect(dev.close).toHaveBeenCalledTimes(1);
  });

  it("does not report a failing claimInterface or security error as missing printer", async () => {
    const claim = Object.assign(new Error("Unable to claim interface"), { name: "NetworkError" });
    mockUsb([fakeDevice({ claimInterface: vi.fn().mockRejectedValue(claim) })]);
    await expect(printJobs(printer, [new Uint8Array([1])])).rejects.toThrow("Drucken fehlgeschlagen: Unable to claim interface");
    const sec = Object.assign(new Error("blocked"), { name: "SecurityError" });
    mockUsb([fakeDevice({ open: vi.fn().mockRejectedValue(sec) })]);
    await expect(printJobs(printer, [new Uint8Array([1])])).rejects.toThrow("Drucken fehlgeschlagen: blocked");
  });

  it("treats a vanished device as missing", async () => {
    const err = Object.assign(new Error("denied"), { name: "NotFoundError" });
    const dev = fakeDevice({ open: vi.fn().mockRejectedValue(err) });
    mockUsb([dev]);
    await expect(printJobs(printer, [new Uint8Array([1])])).rejects.toThrow("Drucker nicht gefunden");
  });
});
