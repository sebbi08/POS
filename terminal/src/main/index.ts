import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { CatalogSnapshot } from "../shared/contract";
import type { NewEvent, TerminalSettings } from "../shared/types";
import { resolveDataDir } from "./data-dir";
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

let mainWindow: BrowserWindow | null = null;

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
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  mainWindow = win;
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

async function start(dataDir: string): Promise<void> {
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
}

const envDataDir = process.env.POS_TERMINAL_DATA_DIR;
const dataDir = resolveDataDir(envDataDir, app.getPath("userData"));
// The single-instance lock lives in userData: give each overridden data dir its own lock.
if (envDataDir !== undefined) app.setPath("userData", join(dataDir, "userData"));

// Two instances on the same data dir could interleave writes (e.g. a startup compact
// renaming over events the other one just fsynced), so only one may touch the store.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  void app.whenReady().then(() => start(dataDir));
}
