import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CatalogSnapshot } from "../shared/contract";
import type { LocalEvent, NewEvent, TerminalSettings } from "../shared/types";

const EVENTS = "events.jsonl";
const SYNCED = "synced.jsonl";
const CATALOG = "catalog.json";
const SETTINGS = "settings.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWLINE = 0x0a;

interface SyncedLine { orderId: string; syncedAt: string }

/**
 * Crash-safe local storage of the terminal. An operation resolves only after its
 * data has been fsynced. All operations run one after another (internal queue).
 */
export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  /** Highest seq known to be on disk; null = must be read from disk first. */
  private maxSeq: number | null = null;

  constructor(private readonly dir: string) {}

  appendEvents(events: NewEvent[]): Promise<LocalEvent[]> {
    return this.serialized(async () => {
      if (events.length === 0) return [];
      if (this.maxSeq === null) this.maxSeq = highestSeq(await readJsonl<LocalEvent>(this.file(EVENTS)));
      let seq = this.maxSeq;
      const stored: LocalEvent[] = events.map((e) => ({
        seq: ++seq,
        orderId: e.orderId,
        type: e.type,
        data: e.data,
        occurredAt: e.occurredAt,
      }));
      try {
        await this.appendLines(EVENTS, stored);
      } catch (err) {
        this.maxSeq = null; // part of the batch may be on disk: re-read before the next append
        throw err;
      }
      this.maxSeq = seq;
      return stored;
    });
  }

  readEvents(): Promise<LocalEvent[]> {
    return this.serialized(() => readJsonl<LocalEvent>(this.file(EVENTS)));
  }

  markSynced(orderIds: string[]): Promise<void> {
    return this.serialized(async () => {
      if (orderIds.length === 0) return;
      const syncedAt = new Date().toISOString();
      await this.appendLines(SYNCED, orderIds.map((orderId): SyncedLine => ({ orderId, syncedAt })));
    });
  }

  readSynced(): Promise<Record<string, string>> {
    return this.serialized(async () => syncedByOrder(await readJsonl<SyncedLine>(this.file(SYNCED))));
  }

  saveCatalog(c: CatalogSnapshot): Promise<void> {
    return this.serialized(() => this.writeJson(CATALOG, c));
  }

  loadCatalog(): Promise<CatalogSnapshot | null> {
    return this.serialized(() => readJson<CatalogSnapshot>(this.file(CATALOG)));
  }

  saveSettings(s: TerminalSettings): Promise<void> {
    return this.serialized(() => this.writeJson(SETTINGS, s));
  }

  loadSettings(): Promise<TerminalSettings | null> {
    return this.serialized(() => readJson<TerminalSettings>(this.file(SETTINGS)));
  }

  /** Removes the events of orders that were synced more than `retentionDays` before `now`. */
  compact(retentionDays: number, now: Date): Promise<void> {
    return this.serialized(async () => {
      const cutoff = now.getTime() - retentionDays * DAY_MS;
      const synced = syncedByOrder(await readJsonl<SyncedLine>(this.file(SYNCED)));
      const expired = new Set(Object.keys(synced).filter((id) => Date.parse(synced[id]) < cutoff));
      if (expired.size === 0) return;
      const events = await readJsonl<LocalEvent>(this.file(EVENTS));
      const kept = events.filter((e) => !expired.has(e.orderId));
      if (kept.length === events.length) return;
      await fs.mkdir(this.dir, { recursive: true });
      await writeFileAtomic(this.file(EVENTS), toJsonl(kept));
      // Keep counting from the pre-compaction maximum so seq values are not reused in this session.
      this.maxSeq = Math.max(this.maxSeq ?? 0, highestSeq(events));
    });
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private file(name: string): string {
    return join(this.dir, name);
  }

  private async appendLines(name: string, records: object[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await appendDurably(this.file(name), toJsonl(records));
  }

  private async writeJson(name: string, value: unknown): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await writeFileAtomic(this.file(name), JSON.stringify(value, null, 2));
  }
}

function toJsonl(records: object[]): string {
  return records.map((r) => JSON.stringify(r) + "\n").join("");
}

function highestSeq(events: LocalEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.seq), 0);
}

/** First recorded syncedAt wins if an order was marked more than once. */
function syncedByOrder(lines: SyncedLine[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { orderId, syncedAt } of lines) {
    if (!(orderId in result)) result[orderId] = syncedAt;
  }
  return result;
}

function parseRecord(text: string): object | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Every acknowledged write ends with "\n". Text after the last newline can only come
 * from a write interrupted by a crash, so it is skipped; any other bad line is corruption.
 */
async function readJsonl<T>(path: string): Promise<T[]> {
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return [];
    throw err;
  }
  const lines = text.split("\n");
  const tail = lines.pop() ?? "";
  const records: T[] = [];
  lines.forEach((line, i) => {
    if (line.trim() === "") return;
    const record = parseRecord(line);
    if (record === null) throw new Error(`${path}: corrupt line ${i + 1}`);
    records.push(record as T);
  });
  if (tail.trim() !== "") {
    const record = parseRecord(tail);
    if (record === null) console.warn(`${path}: skipping truncated last line ${lines.length + 1}`);
    else records.push(record as T);
  }
  return records;
}

/** Appends `lines` with a single write, then fsyncs. Repairs an interrupted previous write first. */
async function appendDurably(path: string, lines: string): Promise<void> {
  const prefix = await repairTail(path);
  const fh = await fs.open(path, "a");
  let created = false;
  try {
    created = (await fh.stat()).size === 0;
    const buf = Buffer.from(prefix + lines, "utf8");
    const { bytesWritten } = await fh.write(buf, 0, buf.length);
    if (bytesWritten !== buf.length) throw new Error(`${path}: short write (${bytesWritten}/${buf.length} bytes)`);
    await fh.sync();
  } finally {
    await fh.close();
  }
  if (created) await fsyncDir(dirname(path));
}

/**
 * Makes sure the file ends with "\n" before appending. Returns "\n" if a complete record only
 * lost its newline; truncates an unfinished line otherwise. Uses its own read/write handle
 * because Windows append handles cannot truncate.
 */
async function repairTail(path: string): Promise<string> {
  let fh: FileHandle;
  try {
    fh = await fs.open(path, "r+");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return "";
    throw err;
  }
  try {
    const { size } = await fh.stat();
    if (size === 0) return "";
    const last = Buffer.alloc(1);
    await fh.read(last, 0, 1, size - 1);
    if (last[0] === NEWLINE) return "";
    const content = await fs.readFile(path);
    const end = content.lastIndexOf(NEWLINE) + 1;
    if (parseRecord(content.subarray(end).toString("utf8")) !== null) return "\n";
    console.warn(`${path}: dropping truncated last line before append`);
    await fh.truncate(end);
    await fh.sync();
    return "";
  } finally {
    await fh.close();
  }
}

/** Writes `<path>.tmp`, fsyncs it and renames it over `path`. */
async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(content, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, path);
  await fsyncDir(dirname(path));
}

async function readJson<T>(path: string): Promise<T | null> {
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return null;
    throw err;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`${path}: invalid JSON (${(err as Error).message})`);
  }
}

/** Persists directory entries (new file, rename). Windows cannot fsync directories. */
async function fsyncDir(dir: string): Promise<void> {
  let fh: FileHandle | undefined;
  try {
    fh = await fs.open(dir, "r");
    await fh.sync();
  } catch (err) {
    if (!isErrno(err, "EPERM", "EISDIR", "EINVAL")) throw err;
  } finally {
    await fh?.close();
  }
}

function isErrno(err: unknown, ...codes: string[]): boolean {
  return typeof err === "object" && err !== null && codes.includes((err as NodeJS.ErrnoException).code ?? "");
}
