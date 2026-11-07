import type { ChildProcess } from "child_process";

// The servers run as process-group leaders (detached: true), so signalling the
// negative pid also reaches children such as vite behind the npx wrapper.
function stopGroup(proc: ChildProcess | undefined, label: string) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
    console.log(`[e2e:teardown] ${label} stopped`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
    console.log(`[e2e:teardown] ${label} already exited`);
  }
}

async function globalTeardown() {
  stopGroup((globalThis as any).__e2eBackend, "Backend");
  stopGroup((globalThis as any).__e2eFrontend, "Frontend");
}

export default globalTeardown;
