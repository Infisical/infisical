import { getAddedFiles, getChangedFiles, getCommitSummaries, getPreviousStableTag, getTagDate, hasGitRef } from "./git.js";

const OWNER = "Infisical";
const REPO = "infisical";
const GITHUB_API_BASE_URL = "https://api.github.com";
const MAX_PRS = 50;

export type PullRequestEvidence = {
  number: number;
  title: string;
  url: string;
  body: string | null;
  labels: string[];
};

export type ReleaseEvidenceBundle = {
  tag: string;
  previousTag: string | null;
  releasedAt: string;
  release: {
    name: string | null;
    body: string | null;
    url: string | null;
  };
  changedFiles: string[];
  addedFiles: string[];
  migrationFiles: string[];
  deploymentFiles: string[];
  configFiles: string[];
  selfHostingDocs: string[];
  commits: { sha: string; subject: string }[];
  pullRequests: PullRequestEvidence[];
};

const githubHeaders = () => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (process.env.UPGRADE_TOOL_GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.UPGRADE_TOOL_GITHUB_TOKEN}`;
  }

  return headers;
};

const fetchJson = async <T>(url: string): Promise<T | null> => {
  const response = await fetch(url, { headers: githubHeaders() }).catch(() => null);

  if (!response) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
};

const findPrNumbers = (commits: { subject: string }[]) => {
  const numbers = new Set<number>();

  for (const commit of commits) {
    for (const match of commit.subject.matchAll(/\(#(\d+)\)/g)) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers].slice(0, MAX_PRS);
};

const isDeploymentFile = (file: string) =>
  [
    "Dockerfile",
    "Dockerfile.standalone-infisical",
    "Dockerfile.fips.standalone-infisical",
    "standalone-entrypoint.sh",
    "docker-compose",
    "docker-swarm/",
    "helm-charts/",
    "render.yaml",
    "nginx/",
    ".nvmrc",
    "backend/package.json",
    "frontend/package.json"
  ].some((pattern) => file === pattern || file.startsWith(pattern));

const isConfigFile = (file: string) =>
  [
    "backend/src/lib/config/env.ts",
    ".env",
    "backend/src/db/knexfile",
    "backend/src/db/auditlog-knexfile",
    "backend/src/main.ts"
  ].some((pattern) => file === pattern || file.startsWith(pattern));

export const collectEvidence = async (tag: string): Promise<ReleaseEvidenceBundle> => {
  if (!hasGitRef(tag)) {
    throw new Error(`Could not find git tag "${tag}"`);
  }

  const previousTag = getPreviousStableTag(tag);
  const changedFiles = getChangedFiles(previousTag, tag);
  const addedFiles = getAddedFiles(previousTag, tag);
  const commits = getCommitSummaries(previousTag, tag);

  const release = await fetchJson<{
    name: string | null;
    body: string | null;
    html_url: string | null;
  }>(`${GITHUB_API_BASE_URL}/repos/${OWNER}/${REPO}/releases/tags/${tag}`);

  const pullRequests = (
    await Promise.all(
      findPrNumbers(commits).map(async (number) => {
        const pr = await fetchJson<{
          number: number;
          title: string;
          html_url: string;
          body: string | null;
          labels: { name: string }[];
        }>(`${GITHUB_API_BASE_URL}/repos/${OWNER}/${REPO}/pulls/${number}`);

        if (!pr) {
          return null;
        }

        return {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          body: pr.body,
          labels: pr.labels.map((label) => label.name)
        };
      })
    )
  ).filter((pr): pr is PullRequestEvidence => Boolean(pr));

  return {
    tag,
    previousTag,
    releasedAt: getTagDate(tag),
    release: {
      name: release?.name ?? null,
      body: release?.body ?? null,
      url: release?.html_url ?? null
    },
    changedFiles,
    addedFiles,
    migrationFiles: addedFiles.filter((file) => file.startsWith("backend/src/db/migrations/")),
    deploymentFiles: changedFiles.filter(isDeploymentFile),
    configFiles: changedFiles.filter(isConfigFile),
    selfHostingDocs: changedFiles.filter((file) => file.startsWith("docs/self-hosting/")),
    commits,
    pullRequests
  };
};
