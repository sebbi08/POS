import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CatalogSnapshot } from "../shared/contract";
import { CURRENT_FORMAT, FormatTooNewError, MIGRATIONS, type Migration } from "./migrations";
import type { LocalEvent, NewEvent, TerminalSettings } from "../shared/types";

interface SyncedLine { orderId: string; syncedAt: string }

/** An append-only JSON-lines file and the shape every line must have. */
interface JsonlFile<T extends object> { name: string; isLine(value: object): value is T }

const EVENTS: JsonlFile<LocalEvent> = {
  name: "events.jsonl",
  isLine: (v): v is LocalEvent =>
    Number.isFinite((v as LocalEvent).seq) && typeof (v as LocalEvent).orderId === "string",
};
const SYNCED: JsonlFile<SyncedLine> = {
  name: "synced.jsonl",
  isLine: (v): v is SyncedLine =>
    typeof (v as SyncedLine).orderId === "string" && typeof (v as SyncedLine).syncedAt === "string",
};
const CATALOG = "catalog.json";
const SETTINGS = "settings.json";
const FORMAT = "format.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWLINE = 0x0a;

/**
 * Crash-safe local storage of the terminal. An operation resolves only after its
 * data has been fsynced. All operations run one after another (internal queue).
 * Changing stored data: add fields only (see the rule in migrations.ts).
 */
export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  /** Highest seq known to be on disk; null = must be read from disk first. */
  private maxSeq: number | null = null;

  constructor(private readonly dir: string) {}

  /**
   * Persists the batch with one write + fsync and resolves with the stored events.
   * Not all-or-nothing: a crash during the write may leave a prefix of the batch on disk.
   * A rejection does not prove that nothing was stored either (e.g. fsync failed after the
   * write), so callers must re-read with `readEvents` instead of blindly retrying.
   */
  appendEvents(events: NewEvent[]): Promise<LocalEvent[]> {
    return this.serialized(async () => {
      if (events.length === 0) return [];
      if (this.maxSeq === null) this.maxSeq = highestSeq(await this.readLines(EVENTS));
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
    return this.serialized(() => this.readLines(EVENTS));
  }

  markSynced(orderIds: string[]): Promise<void> {
    return this.serialized(async () => {
      if (orderIds.length === 0) return;
      const syncedAt = new Date().toISOString();
      await this.appendLines(SYNCED, orderIds.map((orderId): SyncedLine => ({ orderId, syncedAt })));
    });
  }

  readSynced(): Promise<Record<string, string>> {
    return this.serialized(async () => syncedByOrder(await this.readLines(SYNCED)));
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

  /** Stored data format; a missing format.json counts as format 1. */
  format(): Promise<number> {
    return this.serialized(() => this.readFormat());
  }

  /**
   * Brings the data directory to format `current`. Throws FormatTooNewError (changing nothing)
   * if it is newer. Each step is committed by writing format.json, so a failed migration
   * leaves the format at the last completed step. If no step runs, a failure to write the
   * format.json stamp is only logged.
   */
  migrate(migrations: Migration[] = MIGRATIONS, current: number = CURRENT_FORMAT): Promise<void> {
    return this.serialized(async () => {
      const start = await this.readFormat();
      if (start > current) throw new FormatTooNewError();
      for (let from = start; from < current; from++) {
        const migration = migrations.find((m) => m.from === from);
        if (!migration) throw new Error(`no migration from format ${from}`);
        await migration.run(this.dir);
        await this.writeJson(FORMAT, { format: from + 1 });
      }
      if (await readJson<unknown>(this.file(FORMAT))) return;
      // Reached only when no step ran: the data is already in the current format and a missing
      // format.json counts as format 1, so a failed stamp must not keep the till from starting.
      try {
        await this.writeJson(FORMAT, { format: current });
      } catch (err) {
        console.error("format.json could not be written", err);
      }
    });
  }

  private async readFormat(): Promise<number> {
    const stored = await readJson<{ format?: unknown }>(this.file(FORMAT));
    if (stored === null) return 1;
    if (!Number.isInteger(stored.format) || (stored.format as number) < 1) {
      throw new Error(`${this.file(FORMAT)}: invalid format`);
    }
    return stored.format as number;
  }

  /**
   * Removes the events and synced entries of orders that were synced more than
   * `retentionDays` before `now`.
   */
  compact(retentionDays: number, now: Date): Promise<void> {
    return this.serialized(async () => {
      const cutoff = now.getTime() - retentionDays * DAY_MS;
      const syncedLines = await this.readLines(SYNCED);
      const synced = syncedByOrder(syncedLines);
      const expired = new Set(Object.keys(synced).filter((id) => Date.parse(synced[id]) < cutoff));
      if (expired.size === 0) return;
      const events = await this.readLines(EVENTS);
      const kept = events.filter((e) => !expired.has(e.orderId));
      if (kept.length !== events.length) {
        await writeFileAtomic(this.file(EVENTS.name), toJsonl(kept));
        // Keep counting from the pre-compaction maximum so seq values are not reused in this session.
        this.maxSeq = Math.max(this.maxSeq ?? 0, highestSeq(events));
      }
      // Events first: a crash in between only leaves synced entries without events (harmless),
      // never events whose synced entry is gone (they would be uploaded again).
      await writeFileAtomic(this.file(SYNCED.name), toJsonl(syncedLines.filter((l) => !expired.has(l.orderId))));
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

  private readLines<T extends object>(file: JsonlFile<T>): Promise<T[]> {
    return readJsonl(this.file(file.name), file.isLine);
  }

  private async appendLines<T extends object>(file: JsonlFile<T>, records: T[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await appendDurably(this.file(file.name), toJsonl(records), file.isLine);
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

/** Parses one line; null if it is not JSON or not of the expected shape. */
function parseLine<T extends object>(text: string, isLine: (value: object) => value is T): T | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof value === "object" && value !== null && !Array.isArray(value) && isLine(value) ? value : null;
}

/**
 * Every acknowledged write ends with "\n". Text after the last newline can only come
 * from a write interrupted by a crash, so it is skipped; any other bad line is corruption.
 */
async function readJsonl<T extends object>(path: string, isLine: (value: object) => value is T): Promise<T[]> {
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
    const record = parseLine(line, isLine);
    if (record === null) throw new Error(`${path}: corrupt line ${i + 1}`);
    records.push(record);
  });
  if (tail.trim() !== "") {
    const record = parseLine(tail, isLine);
    if (record === null) console.warn(`${path}: skipping truncated last line ${lines.length + 1}`);
    else records.push(record);
  }
  return records;
}

/** Appends `lines` with a single write, then fsyncs. Repairs an interrupted previous write first. */
async function appendDurably<T extends object>(path: string, lines: string, isLine: (value: object) => value is T): Promise<void> {
  const prefix = await repairTail(path, isLine);
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
async function repairTail<T extends object>(path: string, isLine: (value: object) => value is T): Promise<string> {
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
    if (parseLine(content.subarray(end).toString("utf8"), isLine) !== null) return "\n";
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
