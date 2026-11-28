import { describe, expect, it } from "vitest";

import { COMMENT_MARKER, parseDeclaration, renderComment } from "./review-pr.js";

const body = (none: boolean, yes: boolean) =>
  [
    "## Type",
    "- [x] Fix",
    "## Self-hosted upgrade impact",
    "<!-- - [x] None -->",
    `- [${none ? "x" : " "}] None`,
    `- [${yes ? "X" : " "}] Yes, I added a fragment under \`upgrade-impact/changes/\``,
    "## Checklist",
    "- [x] Tested locally"
  ].join("\r\n");

describe("parseDeclaration", () => {
  it("reads the ticked box and ignores commented-out and other sections' boxes", () => {
    expect(parseDeclaration(body(true, false))).toBe("none");
    expect(parseDeclaration(body(false, true))).toBe("yes");
  });

  it("is unclear when no box, both boxes, or no section is present", () => {
    expect(parseDeclaration(body(false, false))).toBe("unclear");
    expect(parseDeclaration(body(true, true))).toBe("unclear");
    expect(parseDeclaration("## Type\n- [x] Fix")).toBe("unclear");
  });
});

describe("renderComment", () => {
  it("renders nothing when the fragments match the changes", () => {
    expect(renderComment([])).toBe("");
  });

  it("renders a suggested fragment as YAML and a removal without one", () => {
    const comment = renderComment([
      {
        kind: "add",
        file: "upgrade-impact/changes/require-redis-url.yaml",
        reason: "env.ts makes REDIS_URL required.",
        fragment: {
          category: "config",
          impactLevel: "high",
          title: "REDIS_URL is required",
          description: "Infisical no longer starts without it.",
          action: "Set REDIS_URL before upgrading."
        }
      },
      { kind: "remove", file: "upgrade-impact/changes/new-table.yaml", reason: "Additive migration.", fragment: null }
    ]);

    expect(comment.startsWith(COMMENT_MARKER)).toBe(true);
    expect(comment).toContain("**Add `upgrade-impact/changes/require-redis-url.yaml`**");
    expect(comment).toContain("```yaml\ncategory: config\nimpactLevel: high\ntitle: REDIS_URL is required");
    expect(comment).toContain("**Remove `upgrade-impact/changes/new-table.yaml`**\n\nAdditive migration.");
  });

  it("keeps model-written text from mentioning people or leaving its code formatting", () => {
    const comment = renderComment([
      {
        kind: "change",
        file: "upgrade-impact/changes/a.yaml`** @octocat",
        reason: "Ask @octocat and @org/team, or mail a@b.co.",
        fragment: {
          category: "config",
          impactLevel: "low",
          title: "T",
          description: "```\n@octocat",
          action: "A"
        }
      }
    ]);

    expect(comment).toContain("**Change `upgrade-impact/changes/a.yaml** @octocat`**");
    expect(comment).toContain("Ask @\u200boctocat and @\u200borg/team, or mail a@\u200bb.co.");
    expect(comment).toMatch(/\n````yaml\ncategory: config[\s\S]*```[\s\S]*\n````\n/);
  });
});
