import fs from "node:fs";
import path from "node:path";

import type { RunEvents, RunEvent } from "../run/events.js";

/**
 * Records an event stream to a file, and plays one back.
 *
 * This exists so the dashboard can be worked on without Docker, without a live instance and without
 * spending anything on API calls: capture one real walk, then iterate against it for as long as it
 * takes. Every previous UI change had to be verified by re-running the walk that produced the state
 * being looked at, which took minutes and cost money each time.
 *
 * The format is JSONL, one `{ t, event }` per line, `t` being milliseconds since the first event.
 * The offsets are what make a playback look like a run rather than a data dump — a page that paints
 * 400 events instantly cannot show whether the in-flight tool state ever renders.
 */

export type RecordedEvent = { t: number; event: RunEvent };

/** Set `GUIDERAILS_LIVE_RECORD=<path>` to capture the next walk. */
export const RECORD_ENV = "GUIDERAILS_LIVE_RECORD";

export const attachRecorder = (events: RunEvents, filePath: string): (() => void) => {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const stream = fs.createWriteStream(filePath, { flags: "w" });
  const start = Date.now();

  const detach = events.on((event) => {
    stream.write(`${JSON.stringify({ t: Date.now() - start, event } satisfies RecordedEvent)}\n`);
  });

  return () => {
    detach();
    stream.end();
  };
};

export const readRecording = (filePath: string): RecordedEvent[] => {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const out: RecordedEvent[] = [];

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as RecordedEvent);
    } catch {
      // A recording is truncated whenever the walk was interrupted, which is most of the time
      // during development. Losing the last partial line is fine; refusing the whole file is not.
      if (index !== lines.length - 1) {
        throw new Error(`${filePath}: line ${index + 1} is not valid JSON`);
      }
    }
  }

  return out;
};

export type PlaybackOptions = {
  /** 1 is real time. Higher is faster. */
  speed: number;
  /**
   * Longest gap actually waited out. A real walk spends ten seconds building a fixture and several
   * more waiting on the model, and none of that is worth re-watching.
   */
  maxGapMs: number;
  /** Called for each event, in order. */
  emit: (event: RunEvent) => void;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const playRecording = async (
  recorded: RecordedEvent[],
  options: PlaybackOptions
): Promise<void> => {
  let previous = recorded[0]?.t ?? 0;

  for (const entry of recorded) {
    const gap = Math.min(Math.max(entry.t - previous, 0) / options.speed, options.maxGapMs);
    previous = entry.t;
    if (gap >= 1) await sleep(gap);
    options.emit(entry.event);
  }
};
