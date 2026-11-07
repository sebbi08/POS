import type { SavedPrinter } from "../../shared/types";

/** Message is German and shown to the user as is. */
export class PrintError extends Error {}

const NOT_FOUND = "Drucker nicht gefunden – ist er eingeschaltet und angeschlossen?";

// Minimal WebUSB surface we use; lib.dom does not ship WebUSB types.
interface UsbEndpoint { direction: string; endpointNumber: number }
interface UsbDevice {
  vendorId: number; productId: number;
  configuration?: { interfaces: { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } }[] };
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: Uint8Array): Promise<{ status?: string } | undefined>;
}
const usbApi = () => (navigator as unknown as { usb: { getDevices(): Promise<UsbDevice[]> } }).usb;

/** A vanished device surfaces as NotFoundError; other failures (e.g. missing driver) keep their message. */
const isMissingDevice = (err: unknown) => err instanceof Error && err.name === "NotFoundError";

/**
 * Sends the jobs over USB. The device is looked up among the devices the main process
 * has permitted (setDevicePermissionHandler); no chooser is ever shown while printing.
 */
export async function printJobs(printer: SavedPrinter | null, jobs: Uint8Array[]): Promise<void> {
  if (!printer) throw new PrintError("Kein Drucker eingerichtet");
  let device: UsbDevice | undefined;
  try {
    const devices = await usbApi().getDevices();
    device = devices.find((d) => d.vendorId === printer.vendorId && d.productId === printer.productId);
    if (!device) throw new PrintError(NOT_FOUND);

    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);
    const iface = device.configuration?.interfaces.find((i) => i.interfaceNumber === 0);
    const endpoint = iface?.alternate.endpoints.find((e) => e.direction === "out");
    if (!endpoint) throw new Error("Kein Ausgabe-Endpunkt gefunden");

    for (const job of jobs) {
      const result = await device.transferOut(endpoint.endpointNumber, job);
      if (result?.status && result.status !== "ok") throw new Error(result.status);
    }
  } catch (err) {
    if (err instanceof PrintError) throw err;
    if (isMissingDevice(err)) throw new PrintError(NOT_FOUND);
    throw new PrintError(`Drucken fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (device) {
      try { await device.close(); } catch { /* already gone */ }
    }
  }
}
