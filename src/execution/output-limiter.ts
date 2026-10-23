// Output ceiling helpers: in-memory cap, head+tail truncation for tool responses, and
// spill of the complete output to a file under the runs cache folder.

import * as fs from "node:fs";
import * as path from "node:path";

/** Default size (characters per stream) of the stdout/stderr returned to the agent. */
export const DEFAULT_MAX_OUTPUT = 4000;
/** Hard ceiling for the in-memory buffer of one stream; the rest goes only to disk. */
export const MEMORY_BUFFER_CAP = 5 * 1024 * 1024;
/** Spill files older than this are pruned. */
const SPILL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Keeps the start and the end of the text, replacing the middle with a marker. */
export function truncateHeadTail(text: string, max: number): { text: string; truncated: boolean } {
  if (max < 1 || text.length <= max) return { text, truncated: false };
  const omittedFor = (keep: number): number => text.length - keep;
  const marker = (keep: number): string => `\n...[${omittedFor(keep)} characters omitted]...\n`;
  const budget = Math.max(0, max - marker(0).length);
  const head = Math.floor(budget / 3);
  const tail = budget - head;
  const kept = head + tail;
  return {
    text: text.slice(0, head) + marker(kept) + (tail > 0 ? text.slice(text.length - tail) : ""),
    truncated: true,
  };
}

/** Appends to a buffer without letting it grow past `cap`. Returns the new value and whether data was dropped. */
export function appendCapped(buffer: string, chunk: string, cap: number): { value: string; dropped: boolean } {
  if (buffer.length >= cap) return { value: buffer, dropped: chunk.length > 0 };
  const room = cap - buffer.length;
  if (chunk.length <= room) return { value: buffer + chunk, dropped: false };
  return { value: buffer + chunk.slice(0, room), dropped: true };
}

/**
 * Streams the complete output of one stream of one run to a file. The file is opened lazily,
 * the first time the in-memory buffer overflows (or at the end if the output exceeded maxOutput).
 */
export class SpillFile {
  private stream: fs.WriteStream | undefined;
  private failed = false;

  constructor(readonly filePath: string) {}

  get isOpen(): boolean {
    return this.stream !== undefined;
  }

  /** Opens the file (creating the folder) and writes the initial content. */
  open(initial: string): void {
    if (this.stream || this.failed) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.stream = fs.createWriteStream(this.filePath, { encoding: "utf8", mode: 0o600 });
      this.stream.on("error", () => {
        this.failed = true;
      });
      if (initial) this.stream.write(initial);
    } catch {
      this.failed = true;
      this.stream = undefined;
    }
  }

  write(chunk: string): void {
    if (!this.stream || this.failed) return;
    this.stream.write(chunk);
  }

  /** Flushes and closes. Resolves true when the file holds the complete output. */
  close(): Promise<boolean> {
    const stream = this.stream;
    if (!stream) return Promise.resolve(false);
    return new Promise((resolve) => {
      if (this.failed) {
        resolve(false);
        return;
      }
      stream.once("error", () => resolve(false));
      stream.end(() => resolve(!this.failed));
    });
  }
}

/** Removes spill files older than the retention window. Best effort, never throws. */
export function pruneSpillDir(dir: string, now = Date.now()): void {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(out|err)$/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        if (now - fs.statSync(full).mtimeMs > SPILL_MAX_AGE_MS) fs.rmSync(full, { force: true });
      } catch {
        // Ignore a single file.
      }
    }
  } catch {
    // Folder does not exist yet.
  }
}
