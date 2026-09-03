import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { emptyUsage } from "../src/llm.js";
import { REPO_ROOT } from "../src/paths.js";
import { renderComment, renderFrontendComments, renderSuggestions } from "../src/report/markdown.js";
import type { Finding, RunResult } from "../src/types.js";

/**
 * The reporting layer reads the guide off disk to build its patches, so it is the part most
 * exposed to the source-quote path being repo-relative rather than absolute. These tests pin the
 * two comment shapes against a real file in this repo.
 */

const GUIDE = "docs/documentation/platform/folder.mdx";

/** A real line in a real guide, so the substitution has genuine bytes to work on. */
const findAddFolderLine = (): { line: number; text: string } => {
  const lines = fs.readFileSync(path.join(REPO_ROOT, GUIDE), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes("Add Folder"));
  return { line: index + 1, text: lines[index] ?? "" };
};

const makeFinding = (overrides: Partial<Finding> = {}): Finding => {
  const { line } = findAddFolderLine();
  return {
    severity: "MISMATCH",
    blame: "DOC_DRIFT",
    guide: GUIDE,
    procedureIndex: 1,
    stepIndex: 1,
    summary: 'The guide says "Add Folder" but the app labels the control "New Folder".',
    docSays: "Add Folder",
    appShows: 'button "New Folder"',
    // Repo-relative, as the compiler now stores it.
    sourceQuote: { text: "Add Folder", file: GUIDE, line },
    suggestion: { file: GUIDE, line, before: "Add Folder", after: "New Folder" },
    frontendAnchor: null,
    evidence: {},
    ...overrides
  };
};

const wrap = (findings: Finding[]): RunResult[] => [
  {
    guide: GUIDE,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl: "http://localhost:8080",
    mode: "agent",
    steps: [],
    findings,
    unverified: []
  }
];

describe("docs suggestions", () => {
  it("resolves a repo-relative quote path and replaces only the changed phrase", () => {
    const { text } = findAddFolderLine();
    const [suggestion] = renderSuggestions(wrap([makeFinding()]));

    expect(suggestion?.path).toBe(GUIDE);
    // A suggestion block replaces the whole line, so the body must carry the entire corrected
    // line. Emitting just "New Folder" would be a one-click way to delete the sentence.
    expect(suggestion?.body).toContain(text.replace("Add Folder", "New Folder"));
    expect(suggestion?.body).toContain("```suggestion");
  });

  it("emits nothing when the quoted phrase is not on the recorded line", () => {
    // Guards against an unanchored suggestion, which is worse than none at all.
    const finding = makeFinding({
      suggestion: { file: GUIDE, line: 1, before: "definitely not on line 1", after: "x" }
    });
    expect(renderSuggestions(wrap([finding]))).toEqual([]);
  });

  it("emits nothing for a finding blamed on the app or the harness", () => {
    expect(renderSuggestions(wrap([makeFinding({ blame: "APP_REGRESSION" })]))).toEqual([]);
    expect(renderSuggestions(wrap([makeFinding({ blame: "HARNESS" })]))).toEqual([]);
  });
});

describe("frontend warnings", () => {
  const anchored = () =>
    makeFinding({
      frontendAnchor: {
        file: "frontend/src/pages/project/AccessControlPage/AccessControlPage.tsx",
        line: 48,
        reasoning: "sets the PageHeader title"
      }
    });

  it("attaches the comment to the frontend line, not the docs line", () => {
    const [comment] = renderFrontendComments(wrap([anchored()]));
    expect(comment?.path).toBe(
      "frontend/src/pages/project/AccessControlPage/AccessControlPage.tsx"
    );
    expect(comment?.line).toBe(48);
  });

  it("carries the docs fix as a plain diff, never a one-click suggestion", () => {
    // GitHub can only apply a suggestion to the file the comment is on, so offering one here
    // would look actionable and silently do nothing.
    const [comment] = renderFrontendComments(wrap([anchored()]));
    expect(comment?.body).toContain("```diff");
    expect(comment?.body).not.toContain("```suggestion");
    expect(comment?.body).toContain(GUIDE);
  });

  it("emits nothing without an anchor", () => {
    expect(renderFrontendComments(wrap([makeFinding()]))).toEqual([]);
  });
});

describe("summary comment", () => {
  it("separates stale docs from a possible app regression", () => {
    const body = renderComment({
      results: wrap([makeFinding(), makeFinding({ blame: "APP_REGRESSION" })]),
      usage: emptyUsage(),
      droppedGuides: [],
      reportUrl: null
    });

    expect(body).toContain("Documentation looks out of date");
    expect(body).toContain("Possible application regression");
    // The hidden marker is what makes the comment update in place instead of stacking up.
    expect(body.startsWith("<!-- guiderails -->")).toBe(true);
  });

  it("hides harness findings behind a fold so they do not read as the author's problem", () => {
    const body = renderComment({
      results: wrap([makeFinding({ blame: "HARNESS" })]),
      usage: emptyUsage(),
      droppedGuides: [],
      reportUrl: null
    });
    expect(body).toContain("<details>");
    expect(body).toContain("probably not your change");
  });

  it("reports a capped guide as not verified rather than staying silent", () => {
    const body = renderComment({
      results: wrap([]),
      usage: emptyUsage(),
      droppedGuides: ["docs/documentation/platform/secret-sharing.mdx"],
      reportUrl: null
    });
    expect(body).toContain("Not verified");
    expect(body).toContain("over the per-PR cap");
  });
});
