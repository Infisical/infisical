import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import { getAddedFiles, getAddingCommit, getFileAtRef, getPreviousStableTag, getTagDate, hasGitRef } from "./git.js";
import { Evidence, ImpactEntry, ImpactLevelSchema, ReleaseImpact } from "./schema.js";

const REPO_URL = "https://github.com/Infisical/infisical";
const MIGRATIONS_DIR = "backend/src/db/migrations/";

export const FRAGMENTS_DIR = "upgrade-impact/changes";
export const FRAGMENT_FILE_NAME = /^[a-z0-9][a-z0-9-]*\.yaml$/;

export const FragmentSchema = z
  .object({
    category: z.enum(["breaking", "config", "deployment", "database", "known-issue"]),
    impactLevel: ImpactLevelSchema.exclude(["none"]),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    action: z.string().trim().min(1)
  })
  .strict();

export type Fragment = z.infer<typeof FragmentSchema>;

export type ReleaseFragment = {
  file: string;
  fragment: Fragment;
  evidence: Evidence;
};

type ReleaseDraft = Pick<
  ReleaseImpact,
  | "impactLevel"
  | "summary"
  | "requiresDbMigration"
  | "breakingChanges"
  | "dbSchemaChanges"
  | "configChanges"
  | "deploymentNotes"
  | "knownIssues"
>;

type Section = "breakingChanges" | "dbSchemaChanges" | "configChanges" | "deploymentNotes" | "knownIssues";

const SECTION_BY_CATEGORY: Record<Fragment["category"], Section> = {
  breaking: "breakingChanges",
  config: "configChanges",
  deployment: "deploymentNotes",
  database: "dbSchemaChanges",
  "known-issue": "knownIssues"
};

const SECTION_LABELS: [Section, string, string][] = [
  ["breakingChanges", "breaking change", "breaking changes"],
  ["configChanges", "configuration change", "configuration changes"],
  ["deploymentNotes", "deployment note", "deployment notes"],
  ["dbSchemaChanges", "database change", "database changes"],
  ["knownIssues", "known issue", "known issues"]
];

export const isFragmentPath = (file: string) =>
  file.startsWith(`${FRAGMENTS_DIR}/`) && FRAGMENT_FILE_NAME.test(file.slice(FRAGMENTS_DIR.length + 1));

export const parseFragment = (content: string, file: string): Fragment => {
  let yaml: unknown;

  try {
    yaml = parse(content);
  } catch (error) {
    throw new Error(`${file} contains invalid YAML: ${(error as Error).message}`);
  }

  const parsed = FragmentSchema.safeParse(yaml);

  if (!parsed.success) {
    throw new Error(`${file} is not a valid upgrade impact fragment: ${parsed.error.message}`);
  }

  return parsed.data;
};

const evidenceForFragment = (previousTag: string, tag: string, file: string): Evidence => {
  const commit = getAddingCommit(previousTag, tag, file);

  if (!commit) {
    return { type: "file", ref: file, path: file };
  }

  const prNumber = commit.subject.match(/^Merge pull request #(\d+) |\(#(\d+)\)\s*$/)?.slice(1).find(Boolean);

  return prNumber
    ? { type: "pr", ref: `#${prNumber}`, url: `${REPO_URL}/pull/${prNumber}`, description: commit.subject }
    : { type: "commit", ref: commit.sha, url: `${REPO_URL}/commit/${commit.sha}`, description: commit.subject };
};

export const draftFromFragments = (fragments: ReleaseFragment[], migrationFiles: string[]): ReleaseDraft => {
  const draft: ReleaseDraft = {
    impactLevel: "none",
    summary: "",
    requiresDbMigration: migrationFiles.length > 0,
    breakingChanges: [],
    dbSchemaChanges: [],
    configChanges: [],
    deploymentNotes: [],
    knownIssues: []
  };

  const raiseImpact = (level: ReleaseDraft["impactLevel"]) => {
    if (ImpactLevelSchema.options.indexOf(level) > ImpactLevelSchema.options.indexOf(draft.impactLevel)) {
      draft.impactLevel = level;
    }
  };

  for (const { fragment, evidence } of [...fragments].sort((a, b) => a.file.localeCompare(b.file))) {
    const entry: ImpactEntry = {
      title: fragment.title,
      description: fragment.description,
      action: fragment.action,
      confidence: "high",
      evidence: [evidence]
    };

    draft[SECTION_BY_CATEGORY[fragment.category]].push(entry);
    raiseImpact(fragment.impactLevel);
  }

  const counts = SECTION_LABELS.map(([section, singular, plural]) => {
    const count = draft[section].length;
    return count > 0 ? `${count} ${count === 1 ? singular : plural}` : null;
  }).filter((label): label is string => Boolean(label));

  const sentences: string[] = [];

  if (counts.length > 0) {
    sentences.push(`This release has ${counts.join(", ")} for self-hosted operators to review before upgrading.`);
  } else {
    sentences.push("No self-hosted configuration or deployment changes need operator action.");
  }

  if (migrationFiles.length > 0) {
    const sorted = [...migrationFiles].sort();
    const noun = sorted.length === 1 ? "migration" : "migrations";

    draft.dbSchemaChanges.push({
      title: "Database migrations run at startup",
      description: `This release adds ${sorted.length} database ${noun}.`,
      action: "No manual action required; Infisical runs migrations during startup. Back up the database before upgrading.",
      confidence: "high",
      evidence: sorted.map((file) => ({ type: "file", ref: file, path: file }))
    });
    raiseImpact("low");
    sentences.push(`Startup runs ${sorted.length} database ${noun}.`);
  }

  draft.summary = sentences.join(" ");

  return draft;
};

export type FragmentRelease = {
  tag: string;
  previousTag: string | null;
  releasedAt: string;
  draft: ReleaseDraft;
  fragments: ReleaseFragment[];
};

// Reads fragments from the tag itself, so a tag always yields the same data, even after the release
// PR deletes them from main.
export const collectFragmentRelease = (tag: string): FragmentRelease => {
  if (!hasGitRef(tag)) {
    throw new Error(`Could not find git tag "${tag}"`);
  }

  const previousTag = getPreviousStableTag(tag);
  const addedFiles = getAddedFiles(previousTag, tag);

  const fragments = previousTag
    ? addedFiles.filter(isFragmentPath).map((file) => ({
        file,
        fragment: parseFragment(getFileAtRef(tag, file), file),
        evidence: evidenceForFragment(previousTag, tag, file)
      }))
    : [];

  return {
    tag,
    previousTag,
    releasedAt: getTagDate(tag),
    draft: draftFromFragments(
      fragments,
      addedFiles.filter((file) => file.startsWith(MIGRATIONS_DIR))
    ),
    fragments
  };
};

export const getReleaseFragmentFiles = (previousTag: string | null, tag: string) =>
  getAddedFiles(previousTag, tag).filter(isFragmentPath);

// force: a fragment may already be gone from this tree, e.g. one from an older release line.
export const removeFragmentFiles = async (repoRoot: string, files: string[]) => {
  await Promise.all(files.map((file) => fs.rm(path.join(repoRoot, file), { force: true })));
};
