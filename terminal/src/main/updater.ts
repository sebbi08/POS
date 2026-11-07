import { autoUpdater } from "electron-updater";

const FIRST_CHECK_MS = 10_000;
const CHECK_INTERVAL_MS = 30 * 60_000;

export interface UpdaterOptions {
  isPackaged: boolean;
  /** Called with the version once an update is downloaded (it installs on the next quit). */
  notify: (version: string) => void;
}

/**
 * Background auto-update from GitHub Releases. It never blocks startup or selling: errors are
 * only logged, there are no dialogs, and quitAndInstall is never called (the till must not
 * restart mid-sale; the downloaded update installs when the app quits).
 */
export function startUpdater({ isPackaged, notify }: UpdaterOptions): void {
  if (!isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info: { version: string }) => notify(info.version));
  autoUpdater.on("error", (err: unknown) => console.error("updater error", err));

  const check = () => {
    try {
      autoUpdater.checkForUpdates().catch((err: unknown) => console.error("update check failed", err));
    } catch (err) {
      console.error("update check failed", err);
    }
  };
  setTimeout(() => {
    check();
    setInterval(check, CHECK_INTERVAL_MS).unref();
  }, FIRST_CHECK_MS).unref();
}

/** Remembers the ready version so a renderer that subscribes late (or reloads) can still ask. */
export function createUpdateNotice(send: (version: string) => void) {
  let version: string | null = null;
  return {
    ready(v: string): void {
      version = v;
      try {
        send(v);
      } catch (err) {
        console.error("update notice not delivered", err); // destroyed window; current() still answers
      }
    },
    current: (): string | null => version,
  };
}
