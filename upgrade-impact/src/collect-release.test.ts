import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { collectFragmentRelease, removeReleasedFragmentFiles } from "./fragments.js";
import { getFileDiff } from "./git.js";

const fragmentYaml = (title: string) =>
  `category: config\nimpactLevel: medium\ntitle: ${title}\ndescription: D\naction: A\n`;

describe("collectFragmentRelease", () => {
  const originalCwd = process.cwd();
  let repo: string;

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo });

  const commit = async (subject: string, files: Record<string, string | null>) => {
    for (const [file, content] of Object.entries(files)) {
      const fullPath = path.join(repo, file);

      if (content === null) {
        await fs.rm(fullPath);
      } else {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }
    }

    git("add", "-A");
    git("commit", "--quiet", "-m", subject);
  };

  beforeAll(async () => {
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "upgrade-impact-repo-")));
    git("init", "--quiet");

    await commit("feat: first (#1)", { "upgrade-impact/changes/released.yaml": fragmentYaml("Released") });
    git("tag", "v1.0.0");

    // A delete next to a near-identical add is what git reports as a rename.
    await commit("chore(release): v1.0.0 (#2)", {
      "upgrade-impact/changes/released.yaml": null,
      "upgrade-impact/changes/from-pr.yaml": fragmentYaml("From a pull request")
    });
    await commit("direct push", {
      "upgrade-impact/changes/from-commit.yaml": fragmentYaml("From a commit"),
      "upgrade-impact/changes/README.md": "docs",
      "backend/src/db/migrations/1_a.ts": "export {};"
    });
    git("checkout", "--quiet", "-b", "feature");
    await commit("add fragment", { "upgrade-impact/changes/from-merge.yaml": fragmentYaml("From a merge commit") });
    git("checkout", "--quiet", "-");
    git("merge", "--quiet", "--no-ff", "-m", "Merge pull request #4 from org/feature", "feature");
    git("tag", "v1.0.1");

    await commit("chore(release): v1.0.1 (#3)", {
      "upgrade-impact/changes/from-pr.yaml": null,
      "upgrade-impact/changes/from-commit.yaml": null
    });
    await commit("feat: reuse a released name (#5)", {
      "upgrade-impact/changes/from-pr.yaml": fragmentYaml("Reuses a released name")
    });
    await commit("edit in place (#6)", {
      "upgrade-impact/changes/from-merge.yaml": fragmentYaml("Edited after its release")
    });
    git("tag", "v1.0.2");

    process.chdir(path.join(repo, "upgrade-impact"));
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("diffs a repo-root path when run from the package directory", () => {
    expect(getFileDiff("v1.0.0", "v1.0.1", "backend/src/db/migrations/1_a.ts", 3)).toContain("+export {};");
  });

  it("collects the fragments a release added, from the tag, after main deleted them", () => {
    const release = collectFragmentRelease("v1.0.1", new Set(["v1.0.0"]));
    const sha = git("rev-parse", "v1.0.1^").toString().trim();

    expect(release.previousTag).toBe("v1.0.0");
    expect(release.fragments.map(({ file, evidence }) => [file, evidence.type, evidence.ref])).toEqual([
      ["upgrade-impact/changes/from-commit.yaml", "commit", sha],
      ["upgrade-impact/changes/from-merge.yaml", "pr", "#4"],
      ["upgrade-impact/changes/from-pr.yaml", "pr", "#2"]
    ]);
    expect(release.draft.configChanges.map((entry) => entry.title)).toEqual([
      "From a commit",
      "From a merge commit",
      "From a pull request"
    ]);
    expect(release.draft.impactLevel).toBe("medium");
    expect(release.draft.requiresDbMigration).toBe(true);
  });

  it("collects a fragment that reuses a released name, but not one edited in place", () => {
    const release = collectFragmentRelease("v1.0.2", new Set(["v1.0.0", "v1.0.1"]));

    expect(release.fragments.map(({ file, evidence }) => [file, evidence.ref])).toEqual([
      ["upgrade-impact/changes/from-pr.yaml", "#5"]
    ]);
    expect(release.draft.configChanges.map((entry) => entry.title)).toEqual(["Reuses a released name"]);
  });

  it("collects the fragments of a release whose data was never generated", () => {
    const release = collectFragmentRelease("v1.0.2", new Set(["v1.0.0"]));

    expect(release.previousTag).toBe("v1.0.0");
    expect(release.fragments.map(({ file, fragment }) => [file, fragment.title])).toEqual([
      ["upgrade-impact/changes/from-merge.yaml", "Edited after its release"],
      ["upgrade-impact/changes/from-pr.yaml", "Reuses a released name"]
    ]);
  });

  it("removes released fragments an earlier release left behind, and spares unreleased ones", async () => {
    await commit("leftovers", {
      "upgrade-impact/changes/from-commit.yaml": fragmentYaml("From a commit"),
      "upgrade-impact/changes/from-pr.yaml": fragmentYaml("A new fragment reusing a released name"),
      "upgrade-impact/changes/unreleased.yaml": fragmentYaml("Unreleased")
    });

    expect(await removeReleasedFragmentFiles(repo, "v1.0.1", "v1.0.0")).toEqual(["upgrade-impact/changes/from-commit.yaml"]);
    expect(git("status", "--short").toString().trim()).toBe("D upgrade-impact/changes/from-commit.yaml");
    expect(await removeReleasedFragmentFiles(repo, "v1.0.0", null)).toEqual([]);
  });

  it("collects nothing for the first release, which has no range to read", () => {
    const release = collectFragmentRelease("v1.0.0", new Set());

    expect(release.previousTag).toBeNull();
    expect(release.fragments).toEqual([]);
  });
});
