import fs from "node:fs";
import path from "node:path";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { addUsage, cachedSystem, getClient, modelFor, type UsageTotals } from "../llm.js";
import { REPO_ROOT } from "../paths.js";
import type { Finding } from "../types.js";

/**
 * Works out which line of the frontend introduced the label a guide now describes wrongly.
 *
 * Why this exists: a GitHub review comment can only be attached to a line that is part of the
 * pull request's diff. On a frontend pull request the stale docs line is not in the diff, so the
 * one-click suggestion is rejected outright. The frontend line *is* in the diff, so the comment
 * goes there instead, in the file the author is already looking at.
 *
 * Why a model rather than a text search: labels are frequently not literal strings in the source.
 * They come from template literals, are split across lines by the formatter, live in a constants
 * file, are assembled from props, or sit behind a translation key. A search handles the easy cases
 * and silently misses exactly the ones worth catching.
 *
 * What keeps it honest is that the answer is trivially checkable. The model returns a file and a
 * line; both must exist and the file must be part of the diff. A wrong answer costs one discarded
 * call, and the finding still reaches the summary comment either way.
 */

const ANCHOR_SYSTEM_PROMPT = `You locate the line of frontend source code responsible for a user-visible label.

You are given a label that appears in a running web application, and a diff of the frontend files changed in a pull request. Every candidate line is prefixed with its file path and its real line number in the new version of the file. Your job is to say which line is responsible for that label appearing on screen.

## What counts as responsible

Prefer, in this order:

1. The line containing the label as a literal string, if there is one.
2. The line defining the constant, translation entry, or variable that holds it.
3. The line rendering the component that displays it, when the text itself is assembled elsewhere or built from props.

The label may not appear verbatim anywhere. It can be split across lines by a formatter, interpolated into a template literal, concatenated, or produced by a translation lookup. Reason about which line a developer would edit to change what the user sees.

## When to decline

Say found: false when the diff genuinely does not contain the responsible line. That is a normal outcome, not a failure: the label may have existed before this pull request and only become reachable because of it, or it may be rendered by a file the pull request never touched. Guessing produces a comment on unrelated code, which is worse than no comment.

Use low confidence when you are picking between several plausible lines, or when you are inferring from a component name rather than seeing the text. Low-confidence answers are discarded, so marking one honestly costs nothing.

Copy the file path exactly as it appears in the prefix. Report the line number exactly as given; do not recompute it.`;

const anchorSchema = z.object({
  found: z
    .boolean()
    .describe("False when the diff does not contain the line responsible for this label."),
  file: z
    .string()
    .nullable()
    .describe("Repo-relative path, copied exactly from the line prefix. Null when found is false."),
  line: z
    .number()
    .int()
    .nullable()
    .describe("The line number from the prefix, not recomputed. Null when found is false."),
  reasoning: z
    .string()
    .describe("One sentence on why this line is the one a developer would edit."),
  confidence: z.enum(["high", "medium", "low"])
});

export type FrontendAnchor = {
  file: string;
  line: number;
  reasoning: string;
};

/** Only source files can plausibly own a label, and only these are worth sending. */
const isFrontendSource = (file: string): boolean =>
  file.startsWith("frontend/src/") && /\.(tsx?|jsx?)$/.test(file);

type DiffFile = { file: string; lines: { line: number; text: string; added: boolean }[] };

/**
 * Turns a unified diff into per-file lists of lines annotated with their real line number in the
 * new version of the file.
 *
 * Doing the arithmetic here rather than asking the model to derive line numbers from hunk headers
 * is the difference between an answer that can be verified and one that is plausible but off by a
 * few lines. Off-by-a-few puts the comment on the wrong line of the right file, which reads as
 * carelessness.
 */
export const parseDiff = (diff: string): DiffFile[] => {
  const out: DiffFile[] = [];

  for (const chunk of diff.split(/^diff --git /m).slice(1)) {
    const pathMatch = chunk.match(/^\+\+\+ b\/(.+)$/m);
    const file = pathMatch?.[1]?.trim();
    if (!file) continue;

    const lines: DiffFile["lines"] = [];
    let newLine = 0;

    for (const raw of chunk.split("\n")) {
      const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk?.[1]) {
        newLine = Number.parseInt(hunk[1], 10);
        continue;
      }
      if (newLine === 0) continue;

      if (raw.startsWith("+") && !raw.startsWith("+++")) {
        lines.push({ line: newLine, text: raw.slice(1), added: true });
        newLine += 1;
      } else if (raw.startsWith(" ")) {
        lines.push({ line: newLine, text: raw.slice(1), added: false });
        newLine += 1;
      }
      // Removed lines do not exist in the new file, so they have no line number to anchor to.
    }

    if (lines.length > 0) out.push({ file, lines });
  }

  return out;
};

/** Keeps the prompt bounded on a large pull request. */
const MAX_RENDERED_LINES = 1500;

const renderDiff = (files: DiffFile[]): { text: string; truncated: boolean } => {
  const rendered: string[] = [];
  let truncated = false;

  for (const entry of files) {
    for (const line of entry.lines) {
      if (rendered.length >= MAX_RENDERED_LINES) {
        truncated = true;
        break;
      }
      rendered.push(`${entry.file}:${line.line}:${line.added ? "+" : " "} ${line.text}`);
    }
    if (truncated) break;
  }

  return { text: rendered.join("\n"), truncated };
};

export type AnchorInput = {
  finding: Pick<Finding, "summary" | "docSays" | "appShows" | "guide">;
  /** Unified diff of the pull request, or null when there is no diff (a local run). */
  diff: string | null;
  changedFiles: string[];
};

export const findFrontendAnchor = async (
  input: AnchorInput,
  usage: UsageTotals
): Promise<FrontendAnchor | null> => {
  if (!input.diff) return null;

  const candidates = parseDiff(input.diff).filter((entry) => isFrontendSource(entry.file));
  if (candidates.length === 0) return null;

  const { text, truncated } = renderDiff(candidates);
  if (text.length === 0) return null;

  const client = getClient();

  const response = await client.messages.parse({
    model: modelFor("anchor"),
    max_tokens: 2000,
    system: cachedSystem(ANCHOR_SYSTEM_PROMPT),
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(anchorSchema) },
    messages: [
      {
        role: "user",
        content: [
          `The application displays this label: ${input.finding.appShows}`,
          `The documentation calls it: ${input.finding.docSays}`,
          `Context: ${input.finding.summary}`,
          "",
          truncated
            ? `Changed frontend lines (truncated at ${MAX_RENDERED_LINES} lines; the answer may not be present):`
            : "Changed frontend lines:",
          text
        ].join("\n")
      }
    ]
  });

  addUsage(usage, response.usage);

  const verdict = response.parsed_output;
  if (!verdict?.found || !verdict.file || verdict.line === null) return null;

  // A low-confidence answer is a guess, and a guess puts a comment on unrelated code.
  if (verdict.confidence === "low") return null;

  return verifyAnchor(
    { file: verdict.file, line: verdict.line, reasoning: verdict.reasoning },
    input.changedFiles
  );
};

/**
 * Rejects anything GitHub would reject, plus anything that points outside the diff.
 *
 * Cheap, and it is what makes trusting the model here reasonable: the failure mode of a wrong
 * answer is a discarded call rather than a comment on somebody's unrelated code.
 */
export const verifyAnchor = (
  anchor: FrontendAnchor,
  changedFiles: string[]
): FrontendAnchor | null => {
  const normalized = anchor.file.replace(/^\.?\//, "");

  // GitHub only accepts a review comment on a line inside the pull request's diff.
  if (!changedFiles.includes(normalized)) return null;
  if (!isFrontendSource(normalized)) return null;
  if (anchor.line < 1) return null;

  const absolute = path.join(REPO_ROOT, normalized);
  let lineCount: number;
  try {
    lineCount = fs.readFileSync(absolute, "utf8").split("\n").length;
  } catch {
    return null;
  }
  if (anchor.line > lineCount) return null;

  return { ...anchor, file: normalized };
};

export { ANCHOR_SYSTEM_PROMPT };
