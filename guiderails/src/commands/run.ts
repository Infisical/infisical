import fs from "node:fs";
import path from "node:path";

import { CREDENTIALS_HINT, emptyUsage, formatUsage, hasLikelyCredentials } from "../llm.js";
import { parseArgs } from "../args.js";
import { REPORTS_DIR } from "../paths.js";
import { resolveRegistryTargets } from "../registry.js";
import { writeHtmlReport } from "../report/html.js";
import {
  COMMENT_MARKER,
  renderComment,
  renderFrontendComments,
  renderSuggestions
} from "../report/markdown.js";
import { attachConsoleReporter, RunEvents } from "../run/events.js";
import { runGuide } from "../run/index.js";
import { attachRecorder, RECORD_ENV } from "../live/record.js";
import { startLiveServer } from "../live/server.js";
import type { RunResult } from "../types.js";

const readChangedFiles = (listPath: string | null): string[] => {
  if (!listPath || !fs.existsSync(listPath)) return [];
  return fs
    .readFileSync(listPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

/**
 * The pull request's unified diff, used to find which frontend line caused a drift.
 * Absent locally, where there is no diff and findings simply carry no frontend anchor.
 */
const readDiff = (diffPath: string | null): string | null => {
  if (!diffPath || !fs.existsSync(diffPath)) return null;
  const contents = fs.readFileSync(diffPath, "utf8");
  return contents.trim().length === 0 ? null : contents;
};

export const runRun = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv, {
    valueFlags: ["--changed-files", "--diff"],
    booleanFlags: ["--screenshots", "--force-agent", "--headed", "--live"]
  });

  if (args.unknown.length > 0) {
    process.stderr.write(`unknown flag(s): ${args.unknown.join(", ")}\n`);
    return 2;
  }

  if (!hasLikelyCredentials()) {
    process.stderr.write(`${CREDENTIALS_HINT}\n`);
    return 2;
  }

  const targets = resolveRegistryTargets(args.positionals);
  const changedFiles = readChangedFiles(args.value("--changed-files"));
  const diff = readDiff(args.value("--diff"));
  const compareScreenshots = args.has("--screenshots");
  const forceAgent = args.has("--force-agent");
  const headed = args.has("--headed");
  const live = args.has("--live");

  const events = new RunEvents();
  const detachConsole = attachConsoleReporter(events);
  // Opt-in tee to a JSONL file, so `guiderails live` can replay this walk with no instance and no
  // API spend. Off unless the variable is set: a walk should not silently write megabytes of frames.
  const recordPath = process.env[RECORD_ENV];
  const stopRecording = recordPath ? attachRecorder(events, recordPath) : null;
  const liveServer = live ? await startLiveServer(events) : null;
  if (liveServer) {
    process.stdout.write(`\nlive view: ${liveServer.url}\n`);
  }

  const usage = emptyUsage();
  const results: RunResult[] = [];
  let hadError = false;

  for (const entry of targets) {
    try {
      const output = await runGuide({
        entry,
        changedFiles,
        diff,
        compareScreenshots,
        forceAgent,
        headed,
        events
      });
      results.push(output.result);
      usage.calls += output.usage.calls;
      usage.inputTokens += output.usage.inputTokens;
      usage.outputTokens += output.usage.outputTokens;
      usage.cacheReadTokens += output.usage.cacheReadTokens;
      usage.cacheWriteTokens += output.usage.cacheWriteTokens;
    } catch (error) {
      hadError = true;
      process.stderr.write(
        `\n${entry.guide} could not be run: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }
  }

  detachConsole();
  stopRecording?.();
  if (recordPath) process.stdout.write(`\nrecorded  ${recordPath}\n`);

  if (results.length > 0) {
    const htmlPath = writeHtmlReport(results, usage);
    const comment = renderComment({
      results,
      usage,
      droppedGuides: [],
      reportUrl: null
    });
    const suggestions = renderSuggestions(results);
    const frontendComments = renderFrontendComments(results);

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORTS_DIR, "comment.md"), comment);
    fs.writeFileSync(
      path.join(REPORTS_DIR, "suggestions.json"),
      `${JSON.stringify(suggestions, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(REPORTS_DIR, "frontend-comments.json"),
      `${JSON.stringify(frontendComments, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(REPORTS_DIR, "results.json"),
      `${JSON.stringify({ results, usage }, null, 2)}\n`
    );

    process.stdout.write(`\nreport   ${htmlPath}\n`);
    process.stdout.write(`comment  ${path.join(REPORTS_DIR, "comment.md")}\n`);
    if (suggestions.length > 0) {
      process.stdout.write(`${suggestions.length} inline docs suggestion(s) ready\n`);
    }
    if (frontendComments.length > 0) {
      process.stdout.write(
        `${frontendComments.length} frontend warning(s) ready (anchored to the changed code)\n`
      );
    }
    process.stdout.write(`${formatUsage(usage)}\n`);
  }

  if (liveServer) {
    process.stdout.write(`\nlive view still serving at ${liveServer.url}; ctrl-c to stop\n`);
    // Deliberately left running so a demo can be inspected after the walk finishes.
    await new Promise(() => {});
  }

  // Warn-only by design. A guide opts into gating with `critical: true`, and only a BLOCKER on
  // such a guide can fail the job: a flaky red X on an advisory check destroys trust in it
  // faster than a missing check ever would.
  const gating = results.flatMap((result) => {
    const entry = targets.find((candidate) => candidate.guide === result.guide);
    if (!entry?.critical) return [];
    return result.findings.filter(
      (finding) => finding.severity === "BLOCKER" && finding.blame !== "HARNESS"
    );
  });

  if (gating.length > 0) {
    process.stderr.write(
      `\n${gating.length} blocking finding(s) on guide(s) marked critical\n`
    );
    return 1;
  }

  return hadError ? 1 : 0;
};

export { COMMENT_MARKER };
