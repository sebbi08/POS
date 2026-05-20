import type { ChildProcess } from "child_process";

async function globalTeardown() {
  const backend = (globalThis as any).__e2eBackend as ChildProcess | undefined;
  const frontend = (globalThis as any).__e2eFrontend as ChildProcess | undefined;
  if (backend) { backend.kill(); console.log("[e2e:teardown] Backend stopped"); }
  if (frontend) { frontend.kill(); console.log("[e2e:teardown] Frontend stopped"); }
}

export default globalTeardown;
