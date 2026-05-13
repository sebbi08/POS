import { defineConfig } from "@playwright/test";
import { execSync } from "child_process";

// Auto-create test database before tests run
try {
  execSync(
    `docker compose exec -T postgres psql -U pos -c "CREATE DATABASE pos_e2e;"`,
    { stdio: "ignore" },
  );
} catch {
  // Database may already exist, that's fine
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
  },
  webServer: [
    {
      command:
        "cd backend && DATABASE_URL=postgresql://pos:pos@localhost:5432/pos_e2e ADMIN_PIN=0000 npx tsx src/index.ts",
      port: 3001,
      timeout: 15000,
      reuseExistingServer: false,
    },
    {
      command: "cd frontend && npx vite --port 5173",
      port: 5173,
      timeout: 15000,
      reuseExistingServer: false,
    },
  ],
});
