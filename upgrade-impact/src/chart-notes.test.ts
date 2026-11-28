import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { draftFromFragments, Fragment, MIGRATIONS_ENTRY_TITLE, ReleaseFragment } from "./fragments.js";
import { ImpactEntry } from "./schema.js";

const BUMP_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../helm-charts/bump-infisical-core-app-version.sh"
);
const CHART_DIR = "helm-charts/infisical-standalone-postgres";

const hasYq = (() => {
  try {
    execFileSync("yq", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const entry = (title: string, evidencePath?: string): ImpactEntry => ({
  title,
  description: `${title} description.`,
  action: `${title} action.`,
  confidence: "high",
  evidence: [
    evidencePath
      ? { type: "file", ref: evidencePath, path: evidencePath }
      : { type: "pr", ref: "#1", url: "https://github.com/Infisical/infisical/pull/1" }
  ]
});

const releaseFragment = (category: Fragment["category"], title: string, description: string): ReleaseFragment => ({
  file: `upgrade-impact/changes/${category}.yaml`,
  fragment: { category, impactLevel: "medium", title, description, action: `${title} action.` },
  evidence: { type: "pr", ref: "#2", url: "https://github.com/Infisical/infisical/pull/2" }
});

const generatedBy = (model: string) => ({ generatedBy: { model } });

// yq ships on the CI runners, where this must run. Locally it is skipped when yq is missing.
describe.skipIf(!hasYq && !process.env.CI)("chart upgrade notes", () => {
  let repo: string;
  let notes: string[];

  beforeAll(async () => {
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "upgrade-impact-chart-")));

    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repo });
    const write = async (file: string, content: string) => {
      await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
      await fs.writeFile(path.join(repo, file), content);
    };

    await write("helm-charts/bump-infisical-core-app-version.sh", await fs.readFile(BUMP_SCRIPT, "utf8"));
    await write(`${CHART_DIR}/Chart.yaml`, 'version: 1.0.0\nappVersion: "v1.0.0"\n');
    await write(`${CHART_DIR}/CHANGELOG.md`, "## 1.0.0\nChanges:\n* Initial release.\n");

    await write(
      "upgrade-impact/data/releases/v1.0.1.yaml",
      stringify({
        breakingChanges: [entry("Model breaking")],
        configChanges: [entry("Model config")],
        deploymentNotes: [entry("Model deployment")],
        dbSchemaChanges: [entry("Model database", "backend/src/db/migrations/1_a.ts")],
        knownIssues: [entry("Model known issue")],
        ...generatedBy("gpt-5.4")
      })
    );
    await write(
      "upgrade-impact/data/releases/v1.0.2.yaml",
      stringify({
        ...draftFromFragments(
          [
            releaseFragment("breaking", "Authored breaking", "Authored breaking description."),
            releaseFragment("config", "Authored config", "Authored config description."),
            releaseFragment("deployment", "Authored deployment", "Wrapped over\n  two lines."),
            releaseFragment("database", "Authored database", "Authored database description."),
            releaseFragment("known-issue", "Authored known issue", "Authored known issue description.")
          ],
          ["backend/src/db/migrations/2_b.ts"]
        ),
        ...generatedBy("fragments")
      })
    );

    git("init", "--quiet");
    git("add", "-A");
    git("commit", "--quiet", "-m", "init");
    for (const tag of ["v1.0.0", "v1.0.1", "v1.0.2"]) {
      git("tag", tag);
    }

    execFileSync("bash", [path.join(repo, "helm-charts/bump-infisical-core-app-version.sh"), "v1.0.2"], {
      cwd: repo,
      env: { ...process.env, BASE_REF: "HEAD", GITHUB_OUTPUT: "" }
    });

    const changelog = await fs.readFile(path.join(repo, CHART_DIR, "CHANGELOG.md"), "utf8");
    const topSection = changelog.slice(0, changelog.indexOf("## 1.0.0"));
    notes = topSection.slice(topSection.indexOf("Upgrade notes:")).trim().split("\n").slice(1);
  });

  afterAll(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("publishes only the breaking changes of a model-generated release", () => {
    expect(notes.filter((line) => line.includes("(`v1.0.1`)"))).toEqual([
      "* Model breaking (`v1.0.1`): Model breaking description. Model breaking action."
    ]);
  });

  it("publishes every category of a release built from fragments, on one line each", () => {
    expect(notes.filter((line) => line.includes("(`v1.0.2`)"))).toEqual([
      "* Authored breaking (`v1.0.2`): Authored breaking description. Authored breaking action.",
      "* Authored config (`v1.0.2`): Authored config description. Authored config action.",
      "* Authored deployment (`v1.0.2`): Wrapped over two lines. Authored deployment action.",
      "* Authored database (`v1.0.2`): Authored database description. Authored database action.",
      "* Authored known issue (`v1.0.2`): Authored known issue description. Authored known issue action."
    ]);
  });

  it("leaves out the entry a release adds for its migrations", () => {
    expect(notes).toHaveLength(6);
    expect(notes.join("\n")).not.toContain(MIGRATIONS_ENTRY_TITLE);
  });
});
