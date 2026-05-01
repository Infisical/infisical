import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { collectEvidence, ReleaseEvidenceBundle } from "../src/evidence.js";
import {
  deterministicDraft,
  GeneratedDraft,
  generateWithOpenAiAgentic,
  MODEL
} from "../src/generate-ai.js";
import { loadPackageEnv } from "../src/env.js";
import { compareVersions, isStableVersion } from "../src/git.js";
import { ReleaseImpact, ReleaseImpactSchema, ReleaseIndex, ReleaseIndexSchema } from "../src/schema.js";

const GENERATOR_NAME = "@infisical/upgrade-impact";
const GENERATOR_VERSION = "1";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    noAi: args.includes("--no-ai")
  };
};

export const assembleReleaseImpact = (
  bundle: ReleaseEvidenceBundle,
  draft: GeneratedDraft,
  model: string
): ReleaseImpact =>
  ReleaseImpactSchema.parse({
    version: bundle.tag,
    releasedAt: bundle.releasedAt,
    sourceTag: bundle.tag,
    previousTag: bundle.previousTag,
    impactLevel: draft.impactLevel,
    summary: draft.summary,
    requiresDbMigration: draft.requiresDbMigration || bundle.migrationFiles.length > 0,
    breakingChanges: draft.breakingChanges,
    dbSchemaChanges: draft.dbSchemaChanges,
    configChanges: draft.configChanges,
    deploymentNotes: draft.deploymentNotes,
    knownIssues: draft.knownIssues,
    generatedBy: {
      generator: GENERATOR_NAME,
      generatorVersion: GENERATOR_VERSION,
      model,
      generatedAt: new Date().toISOString(),
      sourceRange: {
        from: bundle.previousTag,
        to: bundle.tag
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

type GenerateReleaseImpactOptions = {
  tag: string;
  noAi?: boolean;
};

export const generateReleaseImpact = async ({
  tag,
  noAi = false
}: GenerateReleaseImpactOptions) => {
  const bundle = await collectEvidence(tag);
  const sourceModel = noAi ? "deterministic" : MODEL;
  const draft = noAi ? deterministicDraft(bundle) : await generateWithOpenAiAgentic(bundle);
  const releaseImpact = assembleReleaseImpact(bundle, draft, sourceModel);

  return { bundle, releaseImpact };
};

const main = async () => {
  loadPackageEnv(packageRoot);
  const { tag, dryRun, noAi } = parseArgs();

  if (!tag || !isStableVersion(tag)) {
    throw new Error(`Expected a stable vX.Y.Z tag. Received: ${tag ?? "<missing>"}`);
  }

  const { bundle, releaseImpact } = await generateReleaseImpact({ tag, noAi });

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ evidence: bundle, releaseImpact }, null, 2)}\n`);
    return;
  }

  await writeReleaseImpact(releaseImpact);
  process.stdout.write(`Wrote upgrade impact data for ${releaseImpact.version}\n`);
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
