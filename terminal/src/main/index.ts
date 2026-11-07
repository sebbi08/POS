import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { CatalogSnapshot } from "../shared/contract";
import type { NewEvent, TerminalSettings } from "../shared/types";
import { LocalStore } from "./store";

const RETENTION_DAYS = 30;

function registerIpc(store: LocalStore): void {
  ipcMain.handle("store:appendEvents", (_e, events: NewEvent[]) => store.appendEvents(events));
  ipcMain.handle("store:readEvents", () => store.readEvents());
  ipcMain.handle("store:markSynced", (_e, orderIds: string[]) => store.markSynced(orderIds));
  ipcMain.handle("store:readSynced", () => store.readSynced());
  ipcMain.handle("store:saveCatalog", (_e, c: CatalogSnapshot) => store.saveCatalog(c));
  ipcMain.handle("store:loadCatalog", () => store.loadCatalog());
  ipcMain.handle("store:saveSettings", (_e, s: TerminalSettings) => store.saveSettings(s));
  ipcMain.handle("store:loadSettings", () => store.loadSettings());
  ipcMain.handle("app:version", () => app.getVersion());
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "POS Kasse",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(async () => {
  const dataDir = process.env.POS_TERMINAL_DATA_DIR ?? join(app.getPath("userData"), "data");
  const store = new LocalStore(dataDir);
  try {
    await store.compact(RETENTION_DAYS, new Date());
  } catch (err) {
    // Never keep the till from starting because of housekeeping; the error resurfaces on read.
    console.error("compact failed", err);
  }
  registerIpc(store);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
