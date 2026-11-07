import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "main",
          include: ["src/main/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            // The real encoder is not needed for layout tests; the stub records calls.
            "@point-of-sale/receipt-printer-encoder": fileURLToPath(
              new URL("./src/renderer/test/encoder-stub.ts", import.meta.url),
            ),
          },
        },
        test: {
          name: "renderer",
          include: ["src/renderer/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          css: false,
          setupFiles: ["src/renderer/test/setup.ts"],
        },
      },
    ],
  },
});
