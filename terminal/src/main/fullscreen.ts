/** The part of Electron's BrowserWindow that fullscreen handling needs. */
export interface FullScreenWindow {
  isFullScreen(): boolean;
  setFullScreen(flag: boolean): void;
  on(event: "enter-full-screen" | "leave-full-screen", cb: () => void): void;
  isDestroyed(): boolean;
  webContents: { send(channel: string, ...args: unknown[]): void };
}

/**
 * Native window fullscreen, not the HTML Fullscreen API: that one ends on Escape,
 * and Escape also closes dialogs on the till.
 */
export function toggleFullScreen(win: FullScreenWindow | null): void {
  if (win) win.setFullScreen(!win.isFullScreen());
}

/** Reports every change to the renderer, also those from the window manager. */
export function watchFullScreen(win: FullScreenWindow): void {
  const report = (fullScreen: boolean) => () => {
    if (!win.isDestroyed()) win.webContents.send("window:fullScreen", fullScreen);
  };
  win.on("enter-full-screen", report(true));
  win.on("leave-full-screen", report(false));
}
