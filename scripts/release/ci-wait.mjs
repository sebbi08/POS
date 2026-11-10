export async function findRun(listRuns, { attempts, delayMs, sleep }) {
  for (let i = 0; i < attempts; i++) {
    const runs = await listRuns();
    if (runs.length > 0) return runs[0];
    if (i < attempts - 1) await sleep(delayMs);
  }
  return null;
}
