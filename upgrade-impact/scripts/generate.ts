import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import {
  collectFragmentRelease,
  FragmentRelease,
  getReleaseFragmentFiles,
  removeFragmentFiles
} from "../src/fragments.js";
import { compareVersions, isStableVersion } from "../src/git.js";
import { ReleaseImpact, ReleaseImpactSchema, ReleaseIndex, ReleaseIndexSchema } from "../src/schema.js";

const GENERATOR_NAME = "@infisical/upgrade-impact";
const GENERATOR_VERSION = "2";
const FRAGMENTS_SOURCE = "fragments";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..");
const dataDir = path.join(packageRoot, "data");
const releasesDir = path.join(dataDir, "releases");
const indexPath = path.join(dataDir, "index.yaml");

const parseArgs = () => {
  const args = process.argv.slice(2);
  const getValue = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return {
    tag: getValue("--tag") ?? process.env.GITHUB_REF_NAME,
    dryRun: args.includes("--dry-run"),
    fromFile: getValue("--from-file")
  };
};

const assembleReleaseImpact = ({ tag, previousTag, releasedAt, draft }: FragmentRelease): ReleaseImpact =>
  ReleaseImpactSchema.parse({
    version: tag,
    releasedAt,
    sourceTag: tag,
    previousTag,
    ...draft,
    generatedBy: {
      generator: GENERATOR_NAME,
      generatorVersion: GENERATOR_VERSION,
      model: FRAGMENTS_SOURCE,
      generatedAt: new Date().toISOString(),
      sourceRange: {
        from: previousTag,
        to: tag
      }
    }
  });

const readIndex = async (): Promise<ReleaseIndex> => {
  try {
    return ReleaseIndexSchema.parse(parse(await fs.readFile(indexPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, generatedAt: new Date().toISOString(), versions: [] };
    }

    throw error;
  }
};

const writeReleaseImpact = async (releaseImpact: ReleaseImpact) => {
  await fs.mkdir(releasesDir, { recursive: true });
  await fs.writeFile(path.join(releasesDir, `${releaseImpact.version}.yaml`), stringify(releaseImpact));

  const index = await readIndex();
  const nextVersions = [
    ...index.versions.filter((entry) => entry.version !== releaseImpact.version),
    {
      version: releaseImpact.version,
      releasedAt: releaseImpact.releasedAt,
      file: `releases/${releaseImpact.version}.yaml`
    }
  ].sort((a, b) => compareVersions(a.version, b.version));

  await fs.writeFile(
    indexPath,
    stringify(
      ReleaseIndexSchema.parse({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        versions: nextVersions
      })
    )
  );
};

// Release data is only ever aggregated from the fragments pull requests added under
// upgrade-impact/changes, so the same tag always produces the same file.
export const generateReleaseImpact = (tag: string) => {
  const release = collectFragmentRelease(tag);

  return { fragments: release.fragments, releaseImpact: assembleReleaseImpact(release) };
};

const main = async () => {
  const { tag, dryRun, fromFile } = parseArgs();

  // Writes data generated earlier, so a caller can add it to an index that changed since, and
  // removes the fragments that release collected from the tree it is run in.
  if (fromFile) {
    const releaseImpact = ReleaseImpactSchema.parse(parse(await fs.readFile(fromFile, "utf8")));
    await writeReleaseImpact(releaseImpact);
    await removeFragmentFiles(repoRoot, getReleaseFragmentFiles(releaseImpact.previousTag, releaseImpact.version));
    process.stdout.write(`Wrote upgrade impact data for ${releaseImpact.version} from ${fromFile}\n`);
    return;
  }

  if (!tag || !isStableVersion(tag)) {
    throw new Error(`Expected a stable vX.Y.Z tag. Received: ${tag ?? "<missing>"}`);
  }

  const { fragments, releaseImpact } = generateReleaseImpact(tag);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ fragments, releaseImpact }, null, 2)}\n`);
    return;
  }

  await writeReleaseImpact(releaseImpact);
  await removeFragmentFiles(
    repoRoot,
    fragments.map(({ file }) => file)
  );
  process.stdout.write(`Wrote upgrade impact data for ${releaseImpact.version}\n`);
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
