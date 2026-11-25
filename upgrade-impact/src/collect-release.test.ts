import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { collectFragmentRelease } from "./fragments.js";

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

    // Deleting the released fragment next to a near-identical new one is what git reports as a rename.
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
      "upgrade-impact/changes/from-commit.yaml": null,
      "upgrade-impact/changes/from-merge.yaml": null
    });

    process.chdir(path.join(repo, "upgrade-impact"));
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("collects the fragments a release added, from the tag, after main deleted them", () => {
    const release = collectFragmentRelease("v1.0.1");
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

  it("collects nothing for the first release, which has no range to read", () => {
    const release = collectFragmentRelease("v1.0.0");

    expect(release.previousTag).toBeNull();
    expect(release.fragments).toEqual([]);
  });
});
