import { contextBridge, ipcRenderer } from "electron";
import type { TerminalBridge, UsbDeviceChoice } from "../shared/types";

const bridge: TerminalBridge = {
  appendEvents: (events) => ipcRenderer.invoke("store:appendEvents", events),
  readEvents: () => ipcRenderer.invoke("store:readEvents"),
  markSynced: (orderIds) => ipcRenderer.invoke("store:markSynced", orderIds),
  readSynced: () => ipcRenderer.invoke("store:readSynced"),
  saveCatalog: (c) => ipcRenderer.invoke("store:saveCatalog", c),
  loadCatalog: () => ipcRenderer.invoke("store:loadCatalog"),
  saveSettings: (s) => ipcRenderer.invoke("store:saveSettings", s),
  loadSettings: () => ipcRenderer.invoke("store:loadSettings"),
  appVersion: () => ipcRenderer.invoke("app:version"),
  onUsbChoose: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, devices: UsbDeviceChoice[]) => cb(devices);
    ipcRenderer.on("usb:choose", listener);
    return () => { ipcRenderer.removeListener("usb:choose", listener); };
  },
  chooseUsb: (deviceId) => ipcRenderer.invoke("usb:chosen", deviceId),
  onUpdateReady: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, version: string) => cb(version);
    ipcRenderer.on("update:ready", listener);
    // Main remembers the version: a renderer that subscribes late (or reloaded) still gets it.
    void ipcRenderer.invoke("app:updateReady").then((version: string | null) => {
      if (version !== null) cb(version);
    }, () => {});
    return () => { ipcRenderer.removeListener("update:ready", listener); };
  },
};

contextBridge.exposeInMainWorld("terminal", bridge);
