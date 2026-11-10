import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { toggleFullScreen, watchFullScreen, type FullScreenWindow } from "./fullscreen";

/** A window whose fullscreen flag changes and emits like Electron's BrowserWindow. */
function fakeWindow(fullScreen = false) {
  const emitter = new EventEmitter();
  const send = vi.fn();
  const win = {
    isFullScreen: () => fullScreen,
    setFullScreen: vi.fn((flag: boolean) => {
      fullScreen = flag;
      emitter.emit(flag ? "enter-full-screen" : "leave-full-screen");
    }),
    on: (event: string, cb: () => void) => { emitter.on(event, cb); },
    isDestroyed: (): boolean => false,
    webContents: { send },
  } satisfies FullScreenWindow;
  return { win, send };
}

describe("toggleFullScreen", () => {
  it("switches a window into fullscreen and back", () => {
    const { win } = fakeWindow();
    toggleFullScreen(win);
    expect(win.isFullScreen()).toBe(true);
    toggleFullScreen(win);
    expect(win.isFullScreen()).toBe(false);
  });

  it("does nothing without a window", () => {
    expect(() => toggleFullScreen(null)).not.toThrow();
  });
});

describe("watchFullScreen", () => {
  it("tells the renderer when fullscreen starts and ends", () => {
    const { win, send } = fakeWindow();
    watchFullScreen(win);
    win.setFullScreen(true);
    win.setFullScreen(false);
    expect(send.mock.calls).toEqual([["window:fullScreen", true], ["window:fullScreen", false]]);
  });

  it("stays quiet for a destroyed window", () => {
    const { win, send } = fakeWindow();
    win.isDestroyed = () => true;
    watchFullScreen(win);
    win.setFullScreen(true);
    expect(send).not.toHaveBeenCalled();
  });
});
