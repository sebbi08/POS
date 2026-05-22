import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/tests/setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@point-of-sale/webusb-receipt-printer": resolve(__dirname, "src/tests/__mocks__/webusb-stub.ts"),
      "@point-of-sale/receipt-printer-encoder": resolve(__dirname, "src/tests/__mocks__/encoder-stub.ts"),
    },
  },
});
