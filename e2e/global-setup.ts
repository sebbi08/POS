import { execSync, spawn } from "child_process";
import http from "http";

const log = (step: string) => console.log(`[e2e:global-setup] ${step}`);

function waitForPort(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
      req.end();
    };
    tryConnect();
  });
}

async function globalSetup() {
  const t0 = Date.now();
  log("Setup start");

  // Reset database
  log("Resetting database…");
  const dbStart = Date.now();
  try {
    execSync(
      `docker compose exec -T postgres psql -U pos -c "CREATE DATABASE pos_e2e;" 2>/dev/null; ` +
      `docker compose exec -T postgres psql -U pos -d pos_e2e -c "TRUNCATE TABLE order_events, synced_orders, items, item_groups, terminals, company_settings CASCADE;"`,
      { stdio: "ignore", shell: "/bin/bash" },
    );
  } catch { /* table may not exist on first run */ }
  log(`  Database reset in ${Date.now() - dbStart}ms`);

  // Compile TypeScript
  log("Compiling TypeScript…");
  const tscStart = Date.now();
  execSync("cd backend && node_modules/.bin/tsc", { stdio: "inherit" });
  log(`  tsc done in ${Date.now() - tscStart}ms`);

  // Build the terminal app that terminal.spec.ts launches with Electron
  log("Building terminal app…");
  const terminalStart = Date.now();
  execSync("cd terminal && npx electron-vite build", { stdio: "inherit" });
  log(`  Terminal build done in ${Date.now() - terminalStart}ms`);

  // Start servers manually (bypass Playwright's slow port polling)
  log("Starting backend…");
  const backendStart = Date.now();
  const backend = spawn("node", ["dist/index.js"], {
    cwd: "backend",
    env: { ...process.env, DATABASE_URL: "postgresql://pos:pos@localhost:5432/pos_e2e", ADMIN_PIN: "0000" },
    stdio: "pipe",
    detached: true, // own process group so teardown can kill the whole tree
  });
  backend.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
  backend.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
  await waitForPort(3001);
  log(`  Backend ready in ${Date.now() - backendStart}ms`);

  log("Starting frontend…");
  const frontendStart = Date.now();
  // Explicit IPv4: on CI runners "localhost" resolves to ::1, so Vite would
  // listen where neither waitForPort nor the browser (127.0.0.1) looks.
  const frontend = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
    cwd: "frontend",
    stdio: "pipe",
    detached: true, // own process group so teardown can kill the whole tree
  });
  frontend.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
  frontend.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
  await waitForPort(5173, 30000);
  log(`  Frontend ready in ${Date.now() - frontendStart}ms`);

  log(`Setup complete  (total ${Date.now() - t0}ms)`);

  // Store PIDs so teardown can kill servers
  (globalThis as any).__e2eBackend = backend;
  (globalThis as any).__e2eFrontend = frontend;
}

export default globalSetup;

