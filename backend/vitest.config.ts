import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    exclude: ["dist/**", "node_modules/**"],
  },
});
