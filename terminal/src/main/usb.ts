import { ipcMain, type BrowserWindow, type Session, type USBDevice } from "electron";

export interface UsbChoice { deviceId: string; productName?: string; vendorId: number; productId: number }

/**
 * Bridges Electron's `select-usb-device` to the renderer: the list is shown there and the
 * answer comes back via `usb:chosen`. At most one request is pending; a newer one cancels it.
 */
export class UsbChooser {
  private pending: ((deviceId?: string) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dispose: (() => void) | null = null;

  constructor(private readonly timeoutMs = 60_000) {}

  /** `dispose` runs once when this request is settled (answer, cancel, failure or timeout). */
  request(
    devices: USBDevice[],
    send: ((list: UsbChoice[]) => void) | null,
    callback: (deviceId?: string) => void,
    dispose?: () => void,
  ): void {
    this.settle(undefined);
    if (!send) { callback(); dispose?.(); return; }
    this.pending = callback;
    this.dispose = dispose ?? null;
    this.timer = setTimeout(() => this.settle(undefined), this.timeoutMs);
    try {
      send(devices.map((d) => ({
        deviceId: d.deviceId, productName: d.productName, vendorId: d.vendorId, productId: d.productId,
      })));
    } catch {
      this.settle(undefined); // destroyed webContents / crashed frame
    }
  }

  cancel(): void {
    this.settle(undefined);
  }

  chosen(deviceId: string | null): void {
    this.settle(deviceId ?? undefined);
  }

  private settle(deviceId: string | undefined): void {
    const cb = this.pending;
    const dispose = this.dispose;
    this.pending = null;
    this.dispose = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    dispose?.();
    if (!cb) return;
    if (deviceId === undefined) cb(); else cb(deviceId);
  }
}

/**
 * Printing finds the printer through `navigator.usb.getDevices()`, which only works because
 * every USB device is pre-permitted here. `select-usb-device` therefore only fires for the
 * search in the printer settings (requestDevice with empty filters), and Electron does not
 * pass the filters to it, so that case always goes to the renderer chooser.
 */
export function registerUsb(ses: Session, getWindow: () => BrowserWindow | null): void {
  const chooser = new UsbChooser();
  ses.setDevicePermissionHandler((details) => details.deviceType === "usb");
  ses.setPermissionCheckHandler((_wc, permission) => permission === "usb");
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === "usb"));
  ses.on("select-usb-device", (event, details, callback) => {
    event.preventDefault();
    const win = getWindow();
    if (!win || win.isDestroyed()) { chooser.request(details.deviceList, null, callback); return; }
    // A reload, navigation or closed window leaves the renderer without a way to answer.
    const wc = win.webContents;
    const cancel = () => chooser.cancel();
    const onNavigate = (nav: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (nav.isMainFrame && !nav.isSameDocument) chooser.cancel();
    };
    wc.once("destroyed", cancel);
    wc.once("render-process-gone", cancel);
    wc.on("did-start-navigation", onNavigate);
    chooser.request(details.deviceList, (list) => wc.send("usb:choose", list), callback, () => {
      wc.removeListener("destroyed", cancel);
      wc.removeListener("render-process-gone", cancel);
      wc.removeListener("did-start-navigation", onNavigate);
    });
  });
  ipcMain.handle("usb:chosen", (_e, deviceId: string | null) => chooser.chosen(deviceId));
}
