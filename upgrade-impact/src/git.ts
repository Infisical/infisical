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

export const getChangedFiles = (fromTag: string | null, toTag: string) => {
  if (!fromTag) {
    return [];
  }

  return runGit(["diff", "--name-only", `${fromTag}..${toTag}`])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
};

export const getAddedFiles = (fromTag: string | null, toTag: string) => {
  if (!fromTag) {
    return [];
  }

  return runGit(["diff", "--name-status", `${fromTag}..${toTag}`])
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([status]) => status === "A")
    .map(([, file]) => file)
    .filter(Boolean);
};

export const getCommitSummaries = (fromTag: string | null, toTag: string) => {
  const range = fromTag ? `${fromTag}..${toTag}` : toTag;

  return runGit(["log", "--pretty=format:%H%x09%s", range])
    .split("\n")
    .map((line) => {
      const [sha, ...subjectParts] = line.split("\t");
      return { sha, subject: subjectParts.join("\t") };
    })
    .filter(({ sha }) => Boolean(sha));
};
