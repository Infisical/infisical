import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import {
  getAddedFiles,
  getAddingCommit,
  getFileAtRef,
  getFilesAtRef,
  getModifiedFiles,
  getPreviousStableTag,
  getTagDate,
  hasGitRef
} from "./git.js";
import { Evidence, ImpactEntry, ImpactLevelSchema, ReleaseImpact } from "./schema.js";

const REPO_URL = "https://github.com/Infisical/infisical";
const MIGRATIONS_DIR = "backend/src/db/migrations/";

export const FRAGMENTS_DIR = "upgrade-impact/changes";
export const FRAGMENT_FILE_NAME = /^[a-z0-9][a-z0-9-]*\.yaml$/;
export const MIGRATIONS_ENTRY_TITLE = "Database migrations run at startup";

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
      title: MIGRATIONS_ENTRY_TITLE,
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

  // A fragment that reuses the name of one the previous tag still carried is a new note, but the
  // diff reports it as modified. An adding commit in the range tells it apart from an edit in
  // place, which is never collected.
  const reAddedFragments = previousTag
    ? getModifiedFiles(previousTag, tag)
        .filter(isFragmentPath)
        .filter((file) => getAddingCommit(previousTag, tag, file))
    : [];

  const fragments = previousTag
    ? [...addedFiles.filter(isFragmentPath), ...reAddedFragments].map((file) => ({
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

const readFileIfPresent = async (file: string) => {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

// Removes every fragment the tag contains, not only the ones this release added: a release PR built
// on a branch cut before a fragment reached main cannot delete it, so a later release has to. A
// fragment in a tag was collected by that release or an earlier one. The content check spares a new
// fragment that reuses the name of one an older release line still carries.
export const removeReleasedFragmentFiles = async (repoRoot: string, tag: string) => {
  // The first release collects nothing, so its fragments wait for the next one.
  if (!getPreviousStableTag(tag)) {
    return [];
  }

  const removed: string[] = [];

  for (const file of getFilesAtRef(tag, FRAGMENTS_DIR).filter(isFragmentPath)) {
    const fullPath = path.join(repoRoot, file);
    const content = await readFileIfPresent(fullPath);

    if (content !== null && content.trim() === getFileAtRef(tag, file)) {
      await fs.rm(fullPath);
      removed.push(file);
    }
  }

  return removed;
};
