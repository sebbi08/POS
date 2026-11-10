import { useEffect, useState } from "react";

/** Whether the window is fullscreen (as main reports it) and how to toggle it. */
export function useFullScreen() {
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => window.terminal.onFullScreenChange(setFullScreen), []);
  const toggle = () => { void window.terminal.toggleFullScreen(); };
  return { fullScreen, toggle };
}
