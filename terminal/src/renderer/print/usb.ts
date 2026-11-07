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

/** A printer that has not finished by then counts as hanging; the till must not wait for it. */
export const PRINT_TIMEOUT_MS = 20_000;

/**
 * Sends the jobs over USB. The device is looked up among the devices the main process
 * has permitted (setDevicePermissionHandler); no chooser is ever shown while printing.
 * Gives up after PRINT_TIMEOUT_MS, so a hanging printer never blocks the action queue.
 */
export async function printJobs(printer: SavedPrinter | null, jobs: Uint8Array[]): Promise<void> {
  if (!printer) throw new PrintError("Kein Drucker eingerichtet");
  const session: { device?: UsbDevice } = {};
  const work = send(printer, jobs, session);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), PRINT_TIMEOUT_MS);
  });
  try {
    if ((await Promise.race([work, timeout])) === "timeout") {
      work.catch(() => { /* the abandoned attempt may still fail */ });
      // Not awaited: closing a hanging device may hang as well.
      const device = session.device;
      if (device) void Promise.resolve().then(() => device.close()).catch(() => { /* already gone */ });
      throw new PrintError("Drucker antwortet nicht");
    }
  } finally {
    clearTimeout(timer);
  }
}

async function send(printer: SavedPrinter, jobs: Uint8Array[], session: { device?: UsbDevice }): Promise<"done"> {
  let device: UsbDevice | undefined;
  try {
    const devices = await usbApi().getDevices();
    device = devices.find((d) => d.vendorId === printer.vendorId && d.productId === printer.productId);
    if (!device) throw new PrintError(NOT_FOUND);
    session.device = device;

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
    return "done";
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
