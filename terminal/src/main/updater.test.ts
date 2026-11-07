import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updater = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(async () => null),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { handlers.set(event, cb); }),
  };
});
vi.mock("electron-updater", () => ({ autoUpdater: updater }));

import { createUpdateNotice, startUpdater } from "./updater";

beforeEach(() => {
  vi.useFakeTimers();
  updater.handlers.clear();
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.checkForUpdates.mockReset().mockResolvedValue(null);
  updater.quitAndInstall.mockReset();
  updater.on.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startUpdater", () => {
  it("does nothing when not packaged", async () => {
    startUpdater({ isPackaged: false, notify: vi.fn() });
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.on).not.toHaveBeenCalled();
    expect(updater.autoDownload).toBe(false);
  });

  it("downloads automatically, installs on quit, checks after 10 s and then every 30 min", async () => {
    startUpdater({ isPackaged: true, notify: vi.fn() });
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it("never calls quitAndInstall", async () => {
    const notify = vi.fn();
    startUpdater({ isPackaged: true, notify });
    updater.handlers.get("update-downloaded")?.({ version: "1.2.3" });
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("update-downloaded triggers notify with version", () => {
    const notify = vi.fn();
    startUpdater({ isPackaged: true, notify });
    updater.handlers.get("update-downloaded")?.({ version: "1.2.3" });
    expect(notify).toHaveBeenCalledWith("1.2.3");
  });

  it("check errors are swallowed", async () => {
    updater.checkForUpdates.mockRejectedValue(new Error("offline"));
    startUpdater({ isPackaged: true, notify: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("synchronous throws and updater error events are only logged", async () => {
    updater.checkForUpdates.mockImplementation(() => { throw new Error("boom"); });
    startUpdater({ isPackaged: true, notify: vi.fn() });
    expect(() => updater.handlers.get("error")?.(new Error("x"))).not.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("createUpdateNotice", () => {
  it("sends the version to the renderer and remembers it for late subscribers", () => {
    const send = vi.fn();
    const notice = createUpdateNotice(send);
    expect(notice.current()).toBeNull();
    notice.ready("2.0.0");
    expect(send).toHaveBeenCalledWith("2.0.0");
    expect(notice.current()).toBe("2.0.0");
  });

  it("still remembers the version when sending fails", () => {
    const notice = createUpdateNotice(() => { throw new Error("destroyed"); });
    expect(() => notice.ready("2.0.0")).not.toThrow();
    expect(notice.current()).toBe("2.0.0");
  });
});
