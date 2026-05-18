import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
      "@point-of-sale/webusb-receipt-printer": __dirname + "/src/tests/__mocks__/webusb-stub.ts",
      "@point-of-sale/receipt-printer-encoder": __dirname + "/src/tests/__mocks__/encoder-stub.ts",
    },
  },
});
