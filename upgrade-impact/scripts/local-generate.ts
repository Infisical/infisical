import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { stringify } from "yaml";

import { generateReleaseImpact } from "./generate.js";
import { loadPackageEnv } from "../src/env.js";
import { compareVersions, hasGitRef, isStableVersion, runGit } from "../src/git.js";
import { ReleaseImpactSchema } from "../src/schema.js";

type GitHubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDir = path.join(packageRoot, ".local-output");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const getValue = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return {
    tag: getValue("--tag"),
    output: getValue("--output"),
    noAi: args.includes("--no-ai"),
    skipFetch: args.includes("--skip-fetch")
  };
};

const runGhJson = <T>(args: string[]): T => JSON.parse(execFileSync("gh", args, { encoding: "utf8" })) as T;

const getLatestStableReleaseTags = () => {
  const releases = runGhJson<GitHubRelease[]>([
    "api",
    "repos/Infisical/infisical/releases?per_page=50",
    "--jq",
    "."
  ]);

  const stableReleases = releases
    .filter((release) => !release.draft && !release.prerelease && isStableVersion(release.tag_name))
    .sort((a, b) => {
      if (a.published_at && b.published_at && a.published_at !== b.published_at) {
        return b.published_at.localeCompare(a.published_at);
      }

      return compareVersions(b.tag_name, a.tag_name);
    });

  const [latest, previous] = stableReleases;

  if (!latest || !previous) {
    throw new Error("Expected at least two stable GitHub releases from gh api");
  }

  return { latestTag: latest.tag_name, previousTag: previous.tag_name };
};

const ensureTag = (tag: string, skipFetch: boolean) => {
  if (hasGitRef(tag)) {
    return;
  }

  if (skipFetch) {
    throw new Error(`Missing local git tag ${tag}; rerun without --skip-fetch to fetch it`);
  }

  runGit(["fetch", "--no-tags", "origin", `refs/tags/${tag}:refs/tags/${tag}`]);

  if (!hasGitRef(tag)) {
    throw new Error(`Could not find git tag ${tag} after fetching tags`);
  }
};

const main = async () => {
  loadPackageEnv(packageRoot);
  const { tag: requestedTag, output, noAi, skipFetch } = parseArgs();
  let tag: string;
  let previousTag: string | null;

  if (requestedTag) {
    tag = requestedTag;
    previousTag = null;
  } else {
    const resolved = getLatestStableReleaseTags();
    tag = resolved.latestTag;
    previousTag = resolved.previousTag;
    process.stderr.write(`Resolved latest stable release ${tag} with previous release ${previousTag} from GitHub.\n`);
  }

  if (!isStableVersion(tag)) {
    throw new Error(`Expected a stable vX.Y.Z tag. Received: ${tag}`);
  }

  ensureTag(tag, skipFetch);

  if (previousTag) {
    ensureTag(previousTag, skipFetch);
  }

  const { releaseImpact } = await generateReleaseImpact({ tag, noAi });
  const parsedReleaseImpact = ReleaseImpactSchema.parse(releaseImpact);
  const yaml = stringify(parsedReleaseImpact);
  const outputPath = path.resolve(output ?? path.join(defaultOutputDir, `${tag}.yaml`));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, yaml);

  process.stdout.write(`Wrote ${outputPath}\n`);
  process.stdout.write(
    `Generated ${tag} from ${parsedReleaseImpact.previousTag ?? "<no previous tag>"} with ${parsedReleaseImpact.generatedBy.model}\n`
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
