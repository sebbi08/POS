import { ipcMain, type BrowserWindow, type Session, type USBDevice } from "electron";

export interface UsbChoice { deviceId: string; productName?: string; vendorId: number; productId: number }

/**
 * Bridges Electron's `select-usb-device` to the renderer: the list is shown there and the
 * answer comes back via `usb:chosen`. At most one request is pending; a newer one cancels it.
 */
export class UsbChooser {
  private pending: ((deviceId?: string) => void) | null = null;

  request(
    devices: USBDevice[],
    send: ((list: UsbChoice[]) => void) | null,
    callback: (deviceId?: string) => void,
  ): void {
    this.settle(undefined);
    if (!send) { callback(); return; }
    this.pending = callback;
    send(devices.map((d) => ({
      deviceId: d.deviceId, productName: d.productName, vendorId: d.vendorId, productId: d.productId,
    })));
  }

  chosen(deviceId: string | null): void {
    this.settle(deviceId ?? undefined);
  }

  private settle(deviceId: string | undefined): void {
    const cb = this.pending;
    this.pending = null;
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
  ses.on("select-usb-device", (event, details, callback) => {
    event.preventDefault();
    const win = getWindow();
    chooser.request(details.deviceList, win ? (list) => win.webContents.send("usb:choose", list) : null, callback);
  });
  ipcMain.handle("usb:chosen", (_e, deviceId: string | null) => chooser.chosen(deviceId));
}
