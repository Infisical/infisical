import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { FRAGMENT_FILE_NAME, MIGRATIONS_ENTRY_TITLE, parseFragment } from "./fragments.js";
import { compareVersions, getAddedFiles, hasGitRef } from "./git.js";
import { ReleaseImpact, ReleaseImpactSchema, ReleaseIndex, ReleaseIndexSchema } from "./schema.js";

type ValidateUpgradeImpactDataOptions = {
  dataDir: string;
  changesDir?: string;
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

const evidenceKey = (evidence: ReleaseImpact["breakingChanges"][number]["evidence"][number]) =>
  [evidence.type, evidence.ref, evidence.path ?? "", evidence.url ?? ""].join("\u0000");

const normalizeEntryKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const unclearActionPatterns = [
  /run migrations? before serving traffic/i,
  /verify migration jobs? complete/i,
  /account for/i,
  /review .+ if you rely on/i,
  /set\s+`?TRUSTED_PROXY_CIDRS`?/i,
  /update any automation/i
];

const isUnclearAction = (action: string) => unclearActionPatterns.some((pattern) => pattern.test(action));

const validateDuplicateContent = (release: ReleaseImpact, file: string, errors: string[]) => {
  const seenEntryTitles = new Map<string, string>();
  const sections = [
    ["breakingChanges", release.breakingChanges],
    ["dbSchemaChanges", release.dbSchemaChanges],
    ["configChanges", release.configChanges],
    ["deploymentNotes", release.deploymentNotes],
    ["knownIssues", release.knownIssues]
  ] as const;

  for (const [section, entries] of sections) {
    for (const [entryIndex, entry] of entries.entries()) {
      const titleKey = normalizeEntryKey(entry.title);
      const entryRef = `${section}[${entryIndex}] ${entry.title}`;
      const previousEntryRef = seenEntryTitles.get(titleKey);

      if (previousEntryRef) {
        errors.push(`${file} repeats impact entry title "${entry.title}" in ${previousEntryRef} and ${entryRef}`);
      } else {
        seenEntryTitles.set(titleKey, entryRef);
      }

      if (isUnclearAction(entry.action)) {
        errors.push(`${file} uses unclear operator action in ${entryRef}: ${entry.action}`);
      }

      const seenEvidence = new Set<string>();
      for (const evidence of entry.evidence) {
        const key = evidenceKey(evidence);

        if (seenEvidence.has(key)) {
          errors.push(`${file} repeats evidence ${evidence.type}:${evidence.ref} in ${entryRef}`);
        }

        seenEvidence.add(key);
      }
    }
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

  validateDuplicateContent(release, file, errors);
  validateReleaseAgainstGit(release, file, errors, skipGitChecks);

  return release;
};

const validateFragments = async (changesDir: string, errors: string[]) => {
  let files: string[];

  try {
    files = (await fs.readdir(changesDir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  const fileByTitle = new Map<string, string>();

  for (const file of files) {
    if (file === "README.md") {
      continue;
    }

    if (!FRAGMENT_FILE_NAME.test(file)) {
      errors.push(`changes/${file} must be named <lowercase-kebab-case>.yaml`);
      continue;
    }

    try {
      const { title, action } = parseFragment(
        await fs.readFile(path.join(changesDir, file), "utf8"),
        `changes/${file}`
      );

      // A release copies these verbatim and fails on the same rules, when it's too late to edit.
      if (isUnclearAction(action)) {
        errors.push(`changes/${file} uses unclear operator action: ${action}`);
      }

      const titleKey = normalizeEntryKey(title);

      if (titleKey === normalizeEntryKey(MIGRATIONS_ENTRY_TITLE)) {
        errors.push(
          `changes/${file} uses the title "${title}", which is reserved for the entry a release adds for its migrations. Name the specific change instead.`
        );
      }

      const fileWithSameTitle = fileByTitle.get(titleKey);

      if (fileWithSameTitle) {
        errors.push(`changes/${file} repeats the title of changes/${fileWithSameTitle}: "${title}"`);
      } else {
        fileByTitle.set(titleKey, file);
      }
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
};

export const validateUpgradeImpactData = async ({
  dataDir,
  changesDir,
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

    if (!indexedVersions.has(release.version) || !indexedFiles.has(`releases/${file}`)) {
      process.stderr.write(
        `Skipping ${file}; it is not listed in index.yaml. A release may have been skipped or its impact data not yet indexed.\n`
      );
    }
  }

  if (changesDir) {
    await validateFragments(changesDir, errors);
  }

  return { errors };
};
