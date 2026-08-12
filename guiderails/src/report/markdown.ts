import fs from "node:fs";
import path from "node:path";

import type { Finding, RunResult, Suggestion } from "../types.js";
import { formatUsage, type UsageTotals } from "../llm.js";
import { fromRepoRelative } from "../paths.js";

/**
 * The PR comment body.
 *
 * Written to be skimmed by somebody who did not ask for this check and may not trust it yet, so
 * it leads with what it wants them to do, separates the two blame directions (a docs nit and a
 * possible app bug are not the same ask), and states its own limits rather than implying the
 * absence of findings means full coverage.
 */

export const COMMENT_MARKER = "<!-- guiderails -->";

const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  BLOCKER: 0,
  MISSING_STEP: 1,
  MISMATCH: 2,
  EXTRA_STEP: 3,
  STALE_SCREENSHOT: 4
};

const bySeverity = (a: Finding, b: Finding): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

const guideLink = (guide: string): string => `\`${guide.replace(/^docs\//, "")}\``;

const findingRow = (finding: Finding): string => {
  const location = `${guideLink(finding.guide)}:${finding.sourceQuote.line}`;
  return [
    `**${finding.severity}** in ${location} (step ${finding.stepIndex})`,
    "",
    finding.summary,
    "",
    `- the guide says: ${finding.docSays}`,
    `- the app shows: ${finding.appShows}`,
    ""
  ].join("\n");
};

export type ReportInput = {
  results: RunResult[];
  usage: UsageTotals;
  /** Guides that matched but were dropped by the per-PR cap. */
  droppedGuides: string[];
  reportUrl: string | null;
};

export const renderComment = (input: ReportInput): string => {
  const all = input.results.flatMap((result) => result.findings);

  const docDrift = all.filter((f) => f.blame === "DOC_DRIFT").sort(bySeverity);
  const appRegression = all.filter((f) => f.blame === "APP_REGRESSION").sort(bySeverity);
  const harness = all.filter((f) => f.blame === "HARNESS");

  const totals = input.results.reduce(
    (acc, result) => {
      for (const step of result.steps) acc[step.outcome] += 1;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0, unverified: 0 }
  );

  const lines: string[] = [COMMENT_MARKER, "## Guiderails: documentation walkthrough", ""];

  if (all.length === 0) {
    lines.push(
      `Walked ${input.results.length} guide(s) against a live instance and found no ` +
        `discrepancies. ${totals.passed} step(s) verified.`
    );
  } else {
    lines.push(
      `Walked ${input.results.length} guide(s) against a live instance: ` +
        `${totals.passed} step(s) verified, ${totals.failed} could not be completed as written.`
    );
  }
  lines.push("");

  if (docDrift.length > 0) {
    lines.push(`### Documentation looks out of date (${docDrift.length})`);
    lines.push("");
    lines.push("The app appears correct here, so the fix is a docs edit.");
    lines.push("");
    for (const finding of docDrift) lines.push(findingRow(finding));
  }

  if (appRegression.length > 0) {
    lines.push(`### Possible application regression (${appRegression.length})`);
    lines.push("");
    lines.push(
      "The guide describes behaviour the app no longer has. Worth a look before assuming the " +
        "docs are wrong."
    );
    lines.push("");
    for (const finding of appRegression) lines.push(findingRow(finding));
  }

  // Never let an unverified region read as coverage.
  const unverified = input.results.flatMap((result) => result.unverified);
  if (unverified.length > 0 || totals.unverified > 0 || input.droppedGuides.length > 0) {
    lines.push("### Not verified");
    lines.push("");
    if (totals.unverified > 0) {
      lines.push(
        `- ${totals.unverified} step(s) need something outside this instance (a third-party ` +
          `console, an email inbox, a cloud account) and were not walked.`
      );
    }
    for (const region of unverified.slice(0, 8)) lines.push(`- ${region.reason}`);
    for (const guide of input.droppedGuides) {
      lines.push(`- ${guideLink(guide)} matched this change but was over the per-PR cap.`);
    }
    lines.push("");
  }

  if (harness.length > 0) {
    lines.push(
      `<details><summary>${harness.length} harness issue(s), probably not your change</summary>`
    );
    lines.push("");
    for (const finding of harness) lines.push(`- ${finding.summary}`);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "This check is advisory and does not gate the merge. It walks the guide with an agent, so " +
      "it can be wrong; the sections above separate what it believes about the docs from what " +
      "it believes about the app."
  );
  if (input.reportUrl) lines.push(`Full report with screenshots: ${input.reportUrl}`);
  lines.push("");
  lines.push(`<sub>${formatUsage(input.usage)}</sub>`);

  return lines.join("\n");
};

/**
 * Inline review comments carrying a one-click fix. Only emitted for a label or wording change
 * where the corrected text is mechanical; anything needing judgement is left to the author.
 */
export type ReviewSuggestion = {
  path: string;
  line: number;
  body: string;
};

/**
 * A warning attached to the frontend line that caused the drift, rather than to the stale docs
 * line.
 *
 * This exists because GitHub only accepts a review comment on a line inside the pull request's
 * diff. On a frontend pull request the docs line is not in the diff, so the docs-side suggestion
 * is rejected outright and the author sees nothing. Commenting on their own component works, and
 * is better anyway: the person who renamed the control is the person reading that file.
 *
 * The docs fix travels as a plain fenced diff rather than a `suggestion` block, because a
 * suggestion can only edit the file its comment is attached to. So this is a copyable patch, not
 * a one-click accept, and the body says so rather than implying otherwise.
 */
export const renderFrontendComments = (results: RunResult[]): ReviewSuggestion[] => {
  const out: ReviewSuggestion[] = [];

  for (const result of results) {
    for (const finding of result.findings) {
      const anchor = finding.frontendAnchor;
      if (!anchor || finding.blame !== "DOC_DRIFT") continue;

      const docsPath = finding.sourceQuote.file;
      const body: string[] = [
        "**This change makes a documentation guide inaccurate.**",
        "",
        finding.summary,
        "",
        `- the app now shows: ${finding.appShows}`,
        `- \`${docsPath}\`:${finding.sourceQuote.line} still says: ${finding.docSays}`,
        ""
      ];

      if (finding.suggestion) {
        const patched = patchedLine(finding.suggestion);
        if (patched) {
          body.push(`Suggested edit to \`${docsPath}\` line ${finding.suggestion.line}:`);
          body.push("");
          body.push("```diff");
          body.push(`- ${patched.before}`);
          body.push(`+ ${patched.after}`);
          body.push("```");
          body.push("");
          body.push(
            "GitHub can only apply a one-click suggestion to the file a comment is on, so this " +
              "one has to be copied across. Ideally in this pull request, while the change is " +
              "fresh."
          );
        }
      } else {
        body.push("Please update the guide in this pull request.");
      }

      out.push({ path: anchor.file, line: anchor.line, body: body.join("\n") });
    }
  }

  return out;
};

/** Reads the real docs line so the diff shows a whole line changing, not a bare phrase. */
const patchedLine = (
  suggestion: Suggestion
): { before: string; after: string } | null => {
  let raw: string;
  try {
    const lines = fs.readFileSync(fromRepoRelative(suggestion.file), "utf8").split("\n");
    const candidate = lines[suggestion.line - 1];
    if (candidate === undefined) return null;
    raw = candidate;
  } catch {
    return null;
  }

  if (!raw.includes(suggestion.before)) return null;
  return { before: raw, after: raw.replace(suggestion.before, suggestion.after) };
};

/**
 * A GitHub `suggestion` block replaces the **entire line**, so the body has to be the whole
 * corrected line, not just the corrected phrase. Emitting the bare replacement text would
 * delete the rest of the sentence and produce a one-click way to corrupt the guide.
 *
 * So the real line is read from disk and the substitution applied within it. If the phrase is
 * not actually on that line, no suggestion is emitted: an unanchored suggestion is worse than
 * none, and the finding itself still appears in the summary comment.
 */
export const renderSuggestions = (results: RunResult[]): ReviewSuggestion[] => {
  const out: ReviewSuggestion[] = [];

  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.blame !== "DOC_DRIFT" || !finding.suggestion) continue;

      const { file, line, before, after } = finding.suggestion;

      let rawLine: string;
      try {
        const lines = fs.readFileSync(fromRepoRelative(file), "utf8").split("\n");
        const candidate = lines[line - 1];
        if (candidate === undefined) continue;
        rawLine = candidate;
      } catch {
        continue;
      }

      if (!rawLine.includes(before)) continue;

      out.push({
        // Already repo-relative, which is exactly what the GitHub API wants.
        path: file,
        line,
        body: [
          finding.summary,
          "",
          "```suggestion",
          rawLine.replace(before, after),
          "```"
        ].join("\n")
      });
    }
  }

  return out;
};
