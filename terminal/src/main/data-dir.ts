import { join, resolve } from "node:path";

/** Local data lives in `<userData>/data`, overridable via POS_TERMINAL_DATA_DIR (resolved to absolute). */
export function resolveDataDir(envValue: string | undefined, userDataPath: string): string {
  if (envValue === undefined) return join(userDataPath, "data");
  if (envValue.trim() === "") {
    throw new Error("POS_TERMINAL_DATA_DIR is set but empty. Unset it or point it to a directory.");
  }
  return resolve(envValue);
}
