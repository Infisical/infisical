import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { compareVersions, getAddedFiles, hasGitRef } from "./git.js";
import { ReleaseImpact, ReleaseImpactSchema, ReleaseIndex, ReleaseIndexSchema } from "./schema.js";

type ValidateUpgradeImpactDataOptions = {
  dataDir: string;
  skipGitChecks?: boolean;
};

export type ValidateUpgradeImpactDataResult = {
  errors: string[];
};

const readYaml = async (file: string, errors: string[]) => {
  try {
    return parse(await fs.readFile(file, "utf8")) as unknown;
  } catch (error) {
    errors.push(`${path.basename(file)} contains invalid YAML: ${(error as Error).message}`);
    return null;
  }
};

const listReleaseFiles = async (releasesDir: string) => {
  try {
    return (await fs.readdir(releasesDir)).filter((file) => file.endsWith(".yaml")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

const validateIndexOrder = (versions: { version: string }[], errors: string[]) => {
  for (let i = 1; i < versions.length; i += 1) {
    if (compareVersions(versions[i - 1].version, versions[i].version) >= 0) {
      errors.push(`index.yaml versions must be strictly ascending: ${versions[i - 1].version}, ${versions[i].version}`);
    }
  }
};

const validateReleaseAgainstGit = (release: ReleaseImpact, file: string, errors: string[], skipGitChecks: boolean) => {
  if (skipGitChecks || !release.previousTag) {
    return;
  }

  if (!hasGitRef(release.previousTag) || !hasGitRef(release.sourceTag)) {
    process.stderr.write(
      `Skipping git range checks for ${file}; missing ${release.previousTag} or ${release.sourceTag} locally.\n`
    );
    return;
  }

  const migrationFiles = getAddedFiles(release.previousTag, release.sourceTag).filter((changedFile) =>
    changedFile.startsWith("backend/src/db/migrations/")
  );

  if (migrationFiles.length > 0 && !release.requiresDbMigration) {
    errors.push(`${file} has added migration files but requiresDbMigration is false`);
  }
};

const validateReleaseFile = async (
  releasesDir: string,
  file: string,
  errors: string[],
  skipGitChecks: boolean
): Promise<ReleaseImpact | null> => {
  const fullPath = path.join(releasesDir, file);
  const yaml = await readYaml(fullPath, errors);

  if (!yaml) {
    return null;
  }

  const parsed = ReleaseImpactSchema.safeParse(yaml);

  if (!parsed.success) {
    errors.push(`${file} failed schema validation: ${parsed.error.message}`);
    return null;
  }

  const release = parsed.data;
  const expectedFile = `${release.version}.yaml`;

  if (file !== expectedFile) {
    errors.push(`${file} filename does not match version ${release.version}`);
  }

  if (release.sourceTag !== release.version) {
    errors.push(`${file} sourceTag must match version`);
  }

  if (release.generatedBy.sourceRange.to !== release.version) {
    errors.push(`${file} generatedBy.sourceRange.to must match version`);
  }

  if (release.generatedBy.sourceRange.from !== release.previousTag) {
    errors.push(`${file} generatedBy.sourceRange.from must match previousTag`);
  }

  const entryCount =
    release.breakingChanges.length +
    release.dbSchemaChanges.length +
    release.configChanges.length +
    release.deploymentNotes.length +
    release.knownIssues.length;

  if (release.impactLevel === "none" && entryCount > 0) {
    errors.push(`${file} has impactLevel none but contains impact entries`);
  }

  validateReleaseAgainstGit(release, file, errors, skipGitChecks);

  return release;
};

export const validateUpgradeImpactData = async ({
  dataDir,
  skipGitChecks = false
}: ValidateUpgradeImpactDataOptions): Promise<ValidateUpgradeImpactDataResult> => {
  const errors: string[] = [];
  const indexPath = path.join(dataDir, "index.yaml");
  const releasesDir = path.join(dataDir, "releases");
  const indexYaml = await readYaml(indexPath, errors);
  const parsedIndex = ReleaseIndexSchema.safeParse(indexYaml ?? {});

  if (!parsedIndex.success) {
    errors.push(`index.yaml failed schema validation: ${parsedIndex.error.message}`);
  }

  let index: ReleaseIndex = {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    versions: []
  };

  if (parsedIndex.success) {
    index = parsedIndex.data;
  }

  const indexedVersions = new Set(index.versions.map((entry) => entry.version));
  const indexedFiles = new Set(index.versions.map((entry) => entry.file));
  const releaseFiles = await listReleaseFiles(releasesDir);

  validateIndexOrder(index.versions, errors);

  if (indexedVersions.size !== index.versions.length) {
    errors.push("index.yaml contains duplicate versions");
  }

  for (const entry of index.versions) {
    const expectedFile = `releases/${entry.version}.yaml`;

    if (entry.file !== expectedFile) {
      errors.push(`index entry ${entry.version} must point to ${expectedFile}`);
    }

    try {
      await fs.access(path.join(dataDir, entry.file));
    } catch {
      errors.push(`index entry ${entry.version} points to missing file ${entry.file}`);
    }
  }

  for (const file of releaseFiles) {
    const release = await validateReleaseFile(releasesDir, file, errors, skipGitChecks);

    if (!release) {
      continue;
    }

    if (!indexedVersions.has(release.version)) {
      errors.push(`${file} is not listed in index.yaml`);
    }

    if (!indexedFiles.has(`releases/${file}`)) {
      errors.push(`${file} is not referenced by index.yaml`);
    }
  }

  return { errors };
};
