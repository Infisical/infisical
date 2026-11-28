import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { collectFragmentRelease, FragmentRelease, removeReleasedFragmentFiles } from "../src/fragments.js";
import { compareVersions, getFilesAtRef, isStableVersion } from "../src/git.js";
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
    fromFile: getValue("--from-file"),
    dataRef: getValue("--data-ref")
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

// Data waiting on the release PR's branch counts too (dataRef): that release was collected, just
// not merged, and starting before it would collect its fragments a second time.
const listReleasedVersions = async (dataRef?: string) => {
  let localFiles: string[] = [];

  try {
    localFiles = await fs.readdir(releasesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const refFiles = dataRef ? getFilesAtRef(dataRef, path.relative(repoRoot, releasesDir)) : [];

  return new Set(
    [...localFiles, ...refFiles].filter((file) => file.endsWith(".yaml")).map((file) => path.basename(file, ".yaml"))
  );
};

export const generateReleaseImpact = async (tag: string, dataRef?: string) => {
  const release = collectFragmentRelease(tag, await listReleasedVersions(dataRef));

  return { fragments: release.fragments, releaseImpact: assembleReleaseImpact(release) };
};

const main = async () => {
  const { tag, dryRun, fromFile, dataRef } = parseArgs();

  // Replays data generated earlier onto an index that may have changed since.
  if (fromFile) {
    const releaseImpact = ReleaseImpactSchema.parse(parse(await fs.readFile(fromFile, "utf8")));
    await writeReleaseImpact(releaseImpact);
    await removeReleasedFragmentFiles(repoRoot, releaseImpact.version, releaseImpact.previousTag);
    process.stdout.write(`Wrote upgrade impact data for ${releaseImpact.version} from ${fromFile}\n`);
    return;
  }

  if (!tag || !isStableVersion(tag)) {
    throw new Error(`Expected a stable vX.Y.Z tag. Received: ${tag ?? "<missing>"}`);
  }

  const { fragments, releaseImpact } = await generateReleaseImpact(tag, dataRef);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ fragments, releaseImpact }, null, 2)}\n`);
    return;
  }

  await writeReleaseImpact(releaseImpact);
  await removeReleasedFragmentFiles(repoRoot, releaseImpact.version, releaseImpact.previousTag);
  process.stdout.write(`Wrote upgrade impact data for ${releaseImpact.version}\n`);
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
