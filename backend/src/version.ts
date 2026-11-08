import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/** Version of the backend, read from the package.json next to src/ resp. dist/. */
export function serverVersion(): string {
  if (cached === undefined) {
    const file = fileURLToPath(new URL("../package.json", import.meta.url));
    cached = JSON.parse(readFileSync(file, "utf8")).version as string;
  }
  return cached;
}
