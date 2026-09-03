import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "../args.js";
import { playRecording, readRecording, RECORD_ENV } from "../live/record.js";
import { startLiveServer } from "../live/server.js";
import { REPORTS_DIR } from "../paths.js";
import { RunEvents } from "../run/events.js";

/**
 * Replays a recorded walk into the live dashboard. No instance, no Docker, no API spend.
 *
 * The point is the development loop for the dashboard itself: capture one real walk with
 * `GUIDERAILS_LIVE_RECORD=…`, then iterate against it for as long as the UI takes. It is also the
 * honest way to demo the thing offline, since what it shows is a recording of a real run rather than
 * fabricated events.
 */

const DEFAULT_RECORDING = path.join(REPORTS_DIR, "last-run.jsonl");

const USAGE = `guiderails live [recording.jsonl] [--speed n] [--instant] [--loop]

Replays a recorded run into the live dashboard.

Capture one first:
  ${RECORD_ENV}=reports/last-run.jsonl npm run run -- folder --live

Then, with no instance running:
  npm run live

  [recording]    defaults to ${path.relative(process.cwd(), DEFAULT_RECORDING)}
  --speed n      playback rate; 1 is real time, 4 is four times faster (default 2)
  --instant      no waiting at all; useful for checking the finished state
  --loop         start over when it ends
`;

export const runLive = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv, {
    valueFlags: ["--speed"],
    booleanFlags: ["--instant", "--loop", "--help", "-h"]
  });

  if (args.has("--help") || args.has("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (args.unknown.length > 0) {
    process.stderr.write(`unknown flag(s): ${args.unknown.join(", ")}\n\n${USAGE}`);
    return 2;
  }

  const file = path.resolve(args.positionals[0] ?? DEFAULT_RECORDING);
  if (!fs.existsSync(file)) {
    process.stderr.write(`No recording at ${file}.\n\n${USAGE}`);
    return 2;
  }

  const speedInput = args.value("--speed");
  const speed = speedInput === null ? 2 : Number.parseFloat(speedInput);
  if (!Number.isFinite(speed) || speed <= 0) {
    process.stderr.write(`--speed must be a positive number, got "${speedInput ?? ""}".\n`);
    return 2;
  }

  const recorded = readRecording(file);
  if (recorded.length === 0) {
    process.stderr.write(`${file} contains no events.\n`);
    return 2;
  }

  const events = new RunEvents();
  const server = await startLiveServer(events);
  process.stdout.write(
    `\nreplaying ${recorded.length} event(s) from ${path.relative(process.cwd(), file)}\n` +
      `live view: ${server.url}\n\n`
  );

  // A short pause so a browser opened by hand at the URL above is connected before the first events
  // land. Missing them is harmless — history is replayed on connect — but watching it start is the
  // reason to run this at all.
  await new Promise((resolve) => setTimeout(resolve, 750));

  const options = {
    speed: args.has("--instant") ? Number.POSITIVE_INFINITY : speed,
    maxGapMs: args.has("--instant") ? 0 : 1200,
    emit: (event: Parameters<RunEvents["ingest"]>[0]) => events.ingest(event)
  };

  do {
    await playRecording(recorded, options);
    process.stdout.write("playback finished\n");
  } while (args.has("--loop"));

  process.stdout.write(`still serving at ${server.url}; ctrl-c to stop\n`);
  await new Promise(() => {});
  return 0;
};
