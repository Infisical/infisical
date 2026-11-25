import { execFileSync } from "node:child_process";

export const runGit = (args: string[]) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  }).trim();

export const hasGitRef = (ref: string) => {
  try {
    runGit(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
};

export const isStableVersion = (tag: string) => /^v\d+\.\d+\.\d+$/.test(tag);

export const compareVersions = (a: string, b: string) => {
  const aParts = a.replace(/^v/, "").split(".").map(Number);
  const bParts = b.replace(/^v/, "").split(".").map(Number);

  for (let i = 0; i < 3; i += 1) {
    if (aParts[i] !== bParts[i]) {
      return aParts[i] - bParts[i];
    }
  }

  return 0;
};

export const getStableTags = () =>
  runGit(["tag", "--list", "v*"])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter(isStableVersion)
    .sort(compareVersions);

export const getPreviousStableTag = (tag: string) => {
  const stableTags = getStableTags();
  const index = stableTags.indexOf(tag);

  if (index <= 0) {
    return null;
  }

  return stableTags[index - 1];
};

export const getTagDate = (tag: string) => runGit(["log", "-1", "--format=%cI", tag]);

const getFilesWithStatus = (fromTag: string | null, toTag: string, wantedStatus: "A" | "M") => {
  if (!fromTag) {
    return [];
  }

  // Without --no-renames git can pair a new fragment with one the last release deleted and call it
  // a rename, which hides the add.
  return runGit(["diff", "--name-status", "--no-renames", `${fromTag}..${toTag}`])
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([status]) => status === wantedStatus)
    .map(([, file]) => file)
    .filter(Boolean);
};

export const getAddedFiles = (fromTag: string | null, toTag: string) => getFilesWithStatus(fromTag, toTag, "A");

export const getModifiedFiles = (fromTag: string | null, toTag: string) => getFilesWithStatus(fromTag, toTag, "M");

export const getFileAtRef = (ref: string, file: string) => runGit(["show", `${ref}:${file}`]);

export const getFilesAtRef = (ref: string, dir: string) =>
  runGit(["ls-tree", "-r", "--name-only", "--full-tree", ref, dir]).split("\n").filter(Boolean);

export const getFileDiff = (base: string, head: string, file: string, contextLines: number) =>
  // Paths are repo-root relative, but git reads pathspecs from the cwd.
  runGit(["diff", `--unified=${contextLines}`, base, head, "--", `:(top)${file}`]);

export const getAddingCommit = (fromTag: string, toTag: string, file: string) => {
  const lines = runGit([
    "log",
    // Stay on the release line so a merge-commit PR resolves to the merge (its subject has the PR
    // number), not the author's branch commit.
    "--first-parent",
    "--no-renames",
    "--diff-filter=A",
    "--pretty=format:%H%x09%s",
    `${fromTag}..${toTag}`,
    "--",
    // Paths are repo-root relative, but git reads pathspecs from the cwd.
    `:(top)${file}`
  ])
    .split("\n")
    .filter(Boolean);
  const oldest = lines[lines.length - 1];

  if (!oldest) {
    return null;
  }

  const [sha, ...subjectParts] = oldest.split("\t");
  return { sha, subject: subjectParts.join("\t") };
};
