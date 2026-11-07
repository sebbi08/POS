/// <reference types="vite/client" />
import type { TerminalBridge } from "../shared/types";

declare global {
  interface Window {
    terminal: TerminalBridge;
  }
}
