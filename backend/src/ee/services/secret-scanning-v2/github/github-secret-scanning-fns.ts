import { Repository } from "@octokit/webhooks-types";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ProbotOctokit } from "probot";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  SecretScanningDataSource,
  SecretScanningFindingSeverity,
  SecretScanningFindingStatus,
  SecretScanningScanTrigger
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  convertPatchLineToFileLineNumber,
  replaceNonChangesWithNewlines,
  toFindingDetails
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import { GitRepositoryScanFindingDetailsSchema } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import {
  TFindingsPayload,
  TQueueSecretScanningResourceDiffScan,
  TSecretScanningRealtimeScanFindings,
  TSecretScanningFactoryProcessEvent,
  TSecretScanningScanReport
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import {
  execFileBounded,
  GIT_PROCESS_ENV,
  SecretScanningExecPhase
} from "@app/ee/services/secret-scanning/secret-scanning-exec";
import { scanContentsAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { chunkArray } from "@app/lib/fn/array";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { GitHubPullRequestEvent } from "./github-secret-scanning-enums";
import { GitHubPullRequestScanMetadataSchema } from "./github-secret-scanning-schemas";
import {
  TGitHubPullRequestScanMetadata,
  TGitHubPullRequestScanPayload,
  TQueueGitHubPullRequestEvent
} from "./github-secret-scanning-types";

export const GITHUB_PULL_REQUEST_CHECK_NAME = "Infisical Secret Scanning";

const COMPARE_COMMITS_PER_PAGE = 100;
const COMPARE_COMMITS_MAX_PAGES = 20;
const COMMIT_FILES_PER_PAGE = 100;
// GitHub lists at most 3,000 of a commit's files, across pages.
const COMMIT_MAX_LISTED_FILES = 3000;
// A file whose patch GitHub leaves out is fetched whole to rebuild it, so its size is capped.
const MISSING_PATCH_MAX_FILE_BYTES = 10 * 1024 * 1024;
// Files are scanned in batches as they are fetched, so a large scan never holds every patch in memory at once.
const SCAN_BATCH_MAX_FILES = 50;
// GitHub rejects a check run update carrying more than 50 annotations; more are sent as further updates.
const CHECK_RUN_ANNOTATIONS_PER_REQUEST = 50;
const CHECK_RUN_MAX_ANNOTATIONS = 500;
const CHECK_RUN_MAX_SUMMARY_FINDINGS = 50;
// GitHub rejects a check run update whose summary is longer than this, which would leave the check running.
const CHECK_RUN_MAX_SUMMARY_LENGTH = 65_535;

type TGitHubOctokit = InstanceType<typeof ProbotOctokit>;

type TGitHubCommitToScan = {
  sha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
};

type TGitHubFileToScan = { commit: TGitHubCommitToScan; filename: string; patch: string };

type TPullRequestCheckRunTarget = {
  installationId: string;
  repositoryFullName: string;
  checkRunId: number;
};

// The statuses a pull request check can be skipped with; each is offered as a button on a failing check, and its
// value is the button's identifier (GitHub allows 20 characters for a label or identifier, 40 for a description).
export const PULL_REQUEST_CHECK_SKIP_ACTIONS = {
  [SecretScanningFindingStatus.FalsePositive]: {
    label: "Skip: False positive",
    description: "Mark the findings as false positives"
  },
  [SecretScanningFindingStatus.Ignore]: {
    label: "Skip: Ignore",
    description: "Ignore the findings"
  }
} as const;

export type TPullRequestCheckSkipStatus = keyof typeof PULL_REQUEST_CHECK_SKIP_ACTIONS;

export const isPullRequestCheckSkipStatus = (
  status: string | null | undefined
): status is TPullRequestCheckSkipStatus =>
  Boolean(status) && Object.keys(PULL_REQUEST_CHECK_SKIP_ACTIONS).includes(status as string);

export type TPullRequestCheckRunResult = {
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "timed_out";
  title: string;
  summary: string;
  findings?: TFindingsPayload;
  offerSkipActions?: boolean;
};

export const getGitHubRadarInstallationOctokit = (installationId: string) => {
  const appCfg = getConfig();

  return new ProbotOctokit({
    auth: {
      appId: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID,
      privateKey: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY,
      installationId
    }
  });
};

const splitRepositoryFullName = (repositoryFullName: string) => {
  const [owner, repo] = repositoryFullName.split("/");
  return { owner, repo };
};

export const isGitHubPullRequestScanPayload = (
  payload: TQueueSecretScanningResourceDiffScan["payload"]
): payload is TGitHubPullRequestScanPayload => "pullRequest" in payload && "checkRunId" in payload;

// A commit's files are paginated; one response alone holds only the first page of them.
const listCommitFiles = async (
  octokit: TGitHubOctokit,
  { owner, repo, sha }: { owner: string; repo: string; sha: string }
) => {
  const files: NonNullable<Awaited<ReturnType<TGitHubOctokit["repos"]["getCommit"]>>["data"]["files"]> = [];
  let parentSha: string | null = null;

  for (let page = 1; files.length < COMMIT_MAX_LISTED_FILES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await octokit.repos.getCommit({ owner, repo, ref: sha, per_page: COMMIT_FILES_PER_PAGE, page });
    const pageFiles = data.files ?? [];

    // GitHub diffs a merge commit's files against its first parent.
    if (page === 1) parentSha = data.parents?.length ? data.parents[0].sha : null;

    files.push(...pageFiles);

    if (pageFiles.length < COMMIT_FILES_PER_PAGE) break;
  }

  return { files, parentSha, isComplete: files.length < COMMIT_MAX_LISTED_FILES };
};

class MissingPatchFileTooLargeError extends Error {}

const getGitHubFileContent = async (
  octokit: TGitHubOctokit,
  { owner, repo, path, ref }: { owner: string; repo: string; path: string; ref: string }
) => {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`Expected a file at ${path} [ref=${ref}], got ${Array.isArray(data) ? "a directory" : data.type}`);
  }

  if (data.size > MISSING_PATCH_MAX_FILE_BYTES) throw new MissingPatchFileTooLargeError();

  // The contents API leaves out the content of a file over 1 MB; the blob API returns it.
  if ("content" in data && data.content && data.encoding === "base64") return Buffer.from(data.content, "base64");

  const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: data.sha });

  return Buffer.from(blob.content, "base64");
};

// Builds the patch GitHub would have sent: a unified diff starting at its first hunk. Context lines are left out, as
// only added lines are scanned.
const buildPatchFromContents = async (before: Buffer, after: Buffer) => {
  const tempFolder = await mkdtemp(join(tmpdir(), "infisical-patch-"));

  try {
    const beforePath = join(tempFolder, "before");
    const afterPath = join(tempFolder, "after");
    const patchPath = join(tempFolder, "patch.diff");

    await Promise.all([writeFile(beforePath, before), writeFile(afterPath, after)]);

    // Exits 1 when the files differ. The diff goes to a file because the process output that is kept is size capped.
    await execFileBounded(
      "git",
      [
        "diff",
        "--no-index",
        "--no-color",
        "--no-ext-diff",
        "--text",
        "--unified=0",
        `--output=${patchPath}`,
        beforePath,
        afterPath
      ],
      {
        phase: SecretScanningExecPhase.Scan,
        timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT,
        env: GIT_PROCESS_ENV,
        successExitCodes: [0, 1]
      }
    );

    const diff = await readFile(patchPath, "utf8");
    const firstHunkIndex = diff.indexOf("\n@@");

    return firstHunkIndex === -1 ? "" : diff.slice(firstHunkIndex + 1);
  } finally {
    await rm(tempFolder, { recursive: true, force: true });
  }
};

// GitHub leaves out the patch of a diff too large to show, so its added lines are diffed here from the file's contents.
const buildMissingGitHubPatch = async (
  octokit: TGitHubOctokit,
  {
    owner,
    repo,
    commitSha,
    parentSha,
    file
  }: {
    owner: string;
    repo: string;
    commitSha: string;
    parentSha: string | null;
    file: { status: string; filename: string; previous_filename?: string };
  }
) => {
  const after = await getGitHubFileContent(octokit, { owner, repo, path: file.filename, ref: commitSha });

  const before =
    file.status === "added" || !parentSha
      ? Buffer.alloc(0)
      : await getGitHubFileContent(octokit, {
          owner,
          repo,
          path: file.previous_filename ?? file.filename,
          ref: parentSha
        });

  return buildPatchFromContents(before, after);
};

const scanGitHubFilesAndGetFindings = async (
  files: TGitHubFileToScan[],
  resourceName: string,
  configPath?: string
): Promise<TFindingsPayload> => {
  const findings = await scanContentsAndGetFindings(
    files,
    ({ patch }) => replaceNonChangesWithNewlines(patch),
    configPath
  );

  const allFindings: SecretMatch[] = findings.map(({ item: { commit, filename, patch }, finding }) => {
    const startLine = convertPatchLineToFileLineNumber(patch, finding.StartLine);
    const endLine =
      finding.StartLine === finding.EndLine ? startLine : convertPatchLineToFileLineNumber(patch, finding.EndLine);
    const startColumn = finding.StartColumn - 1; // subtract 1 for +
    const endColumn = finding.EndColumn - 1; // subtract 1 for +

    return {
      ...finding,
      StartLine: startLine,
      EndLine: endLine,
      StartColumn: startColumn,
      EndColumn: endColumn,
      File: filename,
      Commit: commit.sha,
      Author: commit.authorName,
      Email: commit.authorEmail,
      Message: commit.message,
      Fingerprint: `${commit.sha}:${filename}:${finding.RuleID}:${startLine}:${startColumn}`,
      Date: commit.date,
      Attributes: {
        ...finding.Attributes,
        url: `https://github.com/${resourceName}/blob/${commit.sha}/${filename}#L${startLine}`
      }
    };
  });

  return allFindings.map((finding) => ({
    details: toFindingDetails(finding),
    fingerprint: finding.Fingerprint,
    severity: SecretScanningFindingSeverity.High,
    rule: finding.RuleID
  }));
};

/**
 * A commit that changes more files than GitHub lists can't be fully scanned from the API. A pull request check passes
 * `requireCompleteCommits` so it fails rather than passing on part of the commit; a push scan scans what it can. The
 * same goes for a file whose patch GitHub left out and that can't be rebuilt from its contents.
 */
export const scanGitHubCommitsAndGetFindings = async ({
  octokit,
  repositoryFullName,
  resourceName,
  commits,
  configPath,
  requireCompleteCommits
}: {
  octokit: TGitHubOctokit;
  repositoryFullName: string;
  resourceName: string;
  commits: TGitHubCommitToScan[];
  configPath?: string;
  requireCompleteCommits?: boolean;
}): Promise<TFindingsPayload> => {
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const filesToScan: TGitHubFileToScan[] = [];
  const findings: TFindingsPayload = [];

  for (const commit of commits) {
    // eslint-disable-next-line no-await-in-loop
    const { files, parentSha, isComplete } = await listCommitFiles(octokit, { owner, repo, sha: commit.sha });

    if (!isComplete) {
      if (requireCompleteCommits) {
        throw new Error(
          `Commit ${commit.sha.slice(0, 7)} changes more than ${COMMIT_MAX_LISTED_FILES.toLocaleString("en-US")} files, more than GitHub lists, so it can't be fully scanned.`
        );
      }

      logger.warn(
        `secretScanningV2DiffScan: GitHub - commit files truncated, scanning the first ${files.length} [repository=${repositoryFullName}] [commit=${commit.sha}]`
      );
    }

    for (const file of files) {
      // A renamed, copied or changed file's patch can add lines too; a removed file's adds none.
      // eslint-disable-next-line no-continue
      if (file.status === "removed") continue;

      let { patch } = file;

      // A binary file has no patch either, but adds no lines.
      if (!patch && file.additions > 0) {
        try {
          // eslint-disable-next-line no-await-in-loop
          patch = await buildMissingGitHubPatch(octokit, {
            owner,
            repo,
            commitSha: commit.sha,
            parentSha,
            file
          });
        } catch (error) {
          const reason =
            error instanceof MissingPatchFileTooLargeError
              ? `it is larger than ${MISSING_PATCH_MAX_FILE_BYTES / 1024 / 1024} MB`
              : "its contents couldn't be read from GitHub";

          logger.warn(
            error,
            `secretScanningV2DiffScan: GitHub - file patch missing and couldn't be rebuilt [repository=${repositoryFullName}] [commit=${commit.sha}] [file=${file.filename}]`
          );

          if (requireCompleteCommits) {
            throw new Error(
              `Commit ${commit.sha.slice(0, 7)}'s change to ${file.filename} is too large for GitHub to include, and the file couldn't be scanned in full because ${reason}.`
            );
          }
        }
      }

      if (patch) {
        filesToScan.push({ commit, filename: file.filename, patch });

        if (filesToScan.length >= SCAN_BATCH_MAX_FILES) {
          // eslint-disable-next-line no-await-in-loop
          findings.push(...(await scanGitHubFilesAndGetFindings(filesToScan.splice(0), resourceName, configPath)));
        }
      }
    }
  }

  findings.push(...(await scanGitHubFilesAndGetFindings(filesToScan, resourceName, configPath)));

  return findings;
};

// Compares against the exact head the check was created for, so commits pushed after it are left to their own check.
const listPullRequestCommits = async (
  octokit: TGitHubOctokit,
  { repositoryFullName, baseSha, headSha }: { repositoryFullName: string; baseSha: string; headSha: string }
) => {
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const commits: TGitHubCommitToScan[] = [];
  let totalCommits = 0;

  for (let page = 1; page <= COMPARE_COMMITS_MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${baseSha}...${headSha}`,
      per_page: COMPARE_COMMITS_PER_PAGE,
      page
    });

    totalCommits = data.total_commits;

    commits.push(
      ...data.commits.map((commit) => ({
        sha: commit.sha,
        authorName: commit.commit.author?.name ?? "",
        authorEmail: commit.commit.author?.email ?? "",
        date: commit.commit.author?.date ?? "",
        message: commit.commit.message
      }))
    );

    if (!data.commits.length || commits.length >= totalCommits) break;
  }

  if (commits.length < totalCommits) {
    logger.warn(
      `secretScanningV2PullRequestScan: GitHub - pull request commits truncated [repository=${repositoryFullName}] [headSha=${headSha}] [scannedCommits=${commits.length}] [totalCommits=${totalCommits}]`
    );
  }

  return { commits, totalCommits };
};

export const scanGitHubPullRequest = async ({
  payload,
  resourceName,
  configPath
}: {
  payload: TGitHubPullRequestScanPayload;
  resourceName: string;
  configPath?: string;
}): Promise<TSecretScanningRealtimeScanFindings> => {
  const octokit = getGitHubRadarInstallationOctokit(payload.installationId);

  const { commits, totalCommits } = await listPullRequestCommits(octokit, {
    repositoryFullName: payload.repository.full_name,
    baseSha: payload.pullRequest.baseSha,
    headSha: payload.pullRequest.headSha
  });

  const findings = await scanGitHubCommitsAndGetFindings({
    octokit,
    repositoryFullName: payload.repository.full_name,
    resourceName,
    commits,
    configPath,
    requireCompleteCommits: true
  });

  return { findings, details: { scannedCommitCount: commits.length, totalCommitCount: totalCommits } };
};

export const createPullRequestCheckRun = async ({
  installationId,
  repositoryFullName,
  headSha,
  scanId,
  detailsUrl
}: {
  installationId: string;
  repositoryFullName: string;
  headSha: string;
  scanId: string;
  detailsUrl?: string;
}) => {
  const octokit = getGitHubRadarInstallationOctokit(installationId);
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const { data } = await octokit.checks.create({
    owner,
    repo,
    name: GITHUB_PULL_REQUEST_CHECK_NAME,
    head_sha: headSha,
    // Returned on every event for this check, which is how a re-run finds the scan it repeats.
    external_id: scanId,
    status: "queued",
    ...(detailsUrl ? { details_url: detailsUrl } : {})
  });

  return data.id;
};

// Completed on creation and named like the scan's check, so a required check doesn't block the pull request: `skipped`
// passes branch protection. Checks belong to the commit, not the pull request, and the newest run with our name is the
// one GitHub counts, so a commit a scan already reported on keeps that result. Otherwise pushing a scanned head to a fork
// and opening a pull request from it would turn a failed check into a skipped one. Returns whether it was created.
export const createSkippedPullRequestCheckRun = async ({
  installationId,
  repositoryFullName,
  headSha,
  title,
  summary
}: {
  installationId: string;
  repositoryFullName: string;
  headSha: string;
  title: string;
  summary: string;
}) => {
  const octokit = getGitHubRadarInstallationOctokit(installationId);
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const { data: existing } = await octokit.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    check_name: GITHUB_PULL_REQUEST_CHECK_NAME,
    app_id: Number(getConfig().INF_APP_CONNECTION_GITHUB_RADAR_APP_ID),
    per_page: 1
  });

  if (existing.total_count > 0) return false;

  await octokit.checks.create({
    owner,
    repo,
    name: GITHUB_PULL_REQUEST_CHECK_NAME,
    head_sha: headSha,
    status: "completed",
    conclusion: "skipped",
    completed_at: new Date().toISOString(),
    output: { title, summary }
  });

  return true;
};

// A suite holds one App's check runs for one commit; `latest` returns only the newest run with our check's name.
export const getLatestPullRequestCheckRunExternalId = async ({
  installationId,
  repositoryFullName,
  checkSuiteId
}: {
  installationId: string;
  repositoryFullName: string;
  checkSuiteId: number;
}) => {
  const octokit = getGitHubRadarInstallationOctokit(installationId);
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const { data } = await octokit.checks.listForSuite({
    owner,
    repo,
    check_suite_id: checkSuiteId,
    check_name: GITHUB_PULL_REQUEST_CHECK_NAME,
    filter: "latest"
  });

  return data.check_runs.length ? data.check_runs[0].external_id : null;
};

export const startPullRequestCheckRun = async ({
  installationId,
  repositoryFullName,
  checkRunId
}: TPullRequestCheckRunTarget) => {
  const octokit = getGitHubRadarInstallationOctokit(installationId);
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  await octokit.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "in_progress",
    started_at: new Date().toISOString()
  });
};

const FindingLocationSchema = GitRepositoryScanFindingDetailsSchema.pick({
  file: true,
  startLine: true,
  endLine: true,
  commit: true,
  description: true,
  link: true
});

const getFindingLocations = (findings: TFindingsPayload) =>
  findings.flatMap((finding) => {
    const details = FindingLocationSchema.safeParse(finding.details);
    return details.success ? [{ rule: finding.rule, ...details.data }] : [];
  });

const toCheckRunAnnotations = (findings: TFindingsPayload) =>
  getFindingLocations(findings).map(({ rule, file, startLine, endLine, commit, description }) => ({
    path: file,
    start_line: startLine,
    end_line: endLine,
    annotation_level: "failure" as const,
    title: `Secret detected: ${rule}`,
    message: `${description.replace(/\.+$/, "")}. Found in commit ${commit.slice(0, 7)}.`
  }));

const escapeMarkdownTableCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

// GitHub splits table cells on "|" even inside a link, so it is encoded along with the characters that end a link.
const toMarkdownUrl = (url: string) =>
  url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\|/g, "%7C");

const toStatusLabel = (status?: string | null) =>
  (status ?? SecretScanningFindingStatus.Unresolved)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const getPullRequestScanCheckRunResult = ({
  findings: allFindings,
  scannedCommitCount,
  totalCommitCount,
  findingsUrl
}: {
  findings: (TFindingsPayload[number] & { id?: string; status?: string | null })[];
  scannedCommitCount: number;
  totalCommitCount: number;
  findingsUrl?: string;
}): TPullRequestCheckRunResult => {
  const truncationNote =
    scannedCommitCount < totalCommitCount
      ? `This pull request has ${totalCommitCount} commits. Infisical scanned the first ${scannedCommitCount}; later commits were not scanned.`
      : "";

  const findings = allFindings.filter((finding) => !isPullRequestCheckSkipStatus(finding.status));
  const skippedCount = allFindings.length - findings.length;

  if (!findings.length && skippedCount) {
    return {
      conclusion: truncationNote ? "neutral" : "success",
      title: `${skippedCount} secret(s) skipped`,
      summary: [
        `Found ${skippedCount} secret(s) in the commits of this pull request, all marked as false positives or ignored in Infisical.`,
        truncationNote
      ]
        .filter(Boolean)
        .join("\n\n")
    };
  }

  if (!findings.length) {
    if (truncationNote) {
      return {
        conclusion: "neutral",
        title: "Scan incomplete",
        summary: `No secrets found in the scanned commits. ${truncationNote}`
      };
    }

    return {
      conclusion: "success",
      title: "No secrets found",
      summary: `Scanned ${scannedCommitCount} commit(s) in this pull request. No secrets found.`
    };
  }

  const intro = [
    `Found ${findings.length} secret(s) in the commits of this pull request. Rotate each secret, then remove it from the pull request's history.`,
    "If the findings are false positives or safe to ignore, use Skip: False positive or Skip: Ignore above to mark them in Infisical and re-run this check. To stop a value from being reported anywhere, add it to the allowlist in your Infisical secret scanning configuration.",
    skippedCount ? `${skippedCount} more secret(s) were marked as false positives or ignored in Infisical.` : "",
    truncationNote
  ]
    .filter(Boolean)
    .join("\n\n");

  const tableHeader = ["| Infisical ID | Status | Secret | Commit | File | |", "| --- | --- | --- | --- | --- | --- |"];
  const getShownNote = (shownCount: number) => `Showing ${shownCount} of ${findings.length} findings.`;
  // Reserves room for the note at its longest, since the shown count never has more digits than the total.
  let remainingLength =
    CHECK_RUN_MAX_SUMMARY_LENGTH - [intro, tableHeader.join("\n"), getShownNote(findings.length)].join("\n\n").length;

  const toRows = (withLinks: boolean) =>
    findings.slice(0, CHECK_RUN_MAX_SUMMARY_FINDINGS).flatMap((finding) => {
      const details = FindingLocationSchema.safeParse(finding.details);
      if (!details.success) return [];

      const { file, startLine, commit, link } = details.data;
      const shortId = finding.id ? finding.id.slice(0, 8) : "";

      const cells = [
        withLinks && shortId && findingsUrl ? `[${shortId}](${toMarkdownUrl(findingsUrl)})` : shortId,
        toStatusLabel(finding.status),
        escapeMarkdownTableCell(finding.rule),
        commit.slice(0, 7),
        escapeMarkdownTableCell(`${file}:${startLine}`),
        withLinks && link ? `[View secret](${toMarkdownUrl(link)})` : ""
      ];

      return [`\n| ${cells.join(" | ")} |`];
    });

  // Listing every finding matters more than the links, so all rows lose their links before any row is left out.
  const linkedRows = toRows(true);
  const candidateRows = linkedRows.join("").length <= remainingLength ? linkedRows : toRows(false);

  const rows: string[] = [];
  for (const row of candidateRows) {
    if (row.length > remainingLength) break;
    rows.push(row);
    remainingLength -= row.length;
  }

  const summary = [
    intro,
    tableHeader.join("\n") + rows.join(""),
    rows.length < findings.length ? getShownNote(rows.length) : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    conclusion: "failure",
    title: `${findings.length} secret(s) found`,
    summary,
    findings,
    offerSkipActions: true
  };
};

// A scan that could not finish fails the check rather than passing it, so an outage never lets a secret through.
export const getPullRequestScanFailedCheckRunResult = (
  reason: string,
  conclusion: "failure" | "timed_out" = "failure"
): TPullRequestCheckRunResult => ({
  conclusion,
  title: "Scan failed",
  summary: `Infisical could not scan this pull request: ${reason} Re-run this check to try again.`
});

export const PULL_REQUEST_SCAN_CANCELLED_CHECK_RUN_RESULT: TPullRequestCheckRunResult = {
  conclusion: "cancelled",
  title: "Scan cancelled",
  summary:
    "This repository is no longer part of an Infisical secret scanning data source, so the pull request was not scanned."
};

export const completePullRequestCheckRun = async ({
  installationId,
  repositoryFullName,
  checkRunId,
  result
}: TPullRequestCheckRunTarget & { result: TPullRequestCheckRunResult }) => {
  const octokit = getGitHubRadarInstallationOctokit(installationId);
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const annotations = toCheckRunAnnotations((result.findings ?? []).slice(0, CHECK_RUN_MAX_ANNOTATIONS));
  const [firstBatch = [], ...remainingBatches] = chunkArray(annotations, CHECK_RUN_ANNOTATIONS_PER_REQUEST);

  await octokit.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "completed",
    conclusion: result.conclusion,
    completed_at: new Date().toISOString(),
    output: { title: result.title, summary: result.summary, annotations: firstBatch },
    ...(result.offerSkipActions
      ? {
          actions: Object.entries(PULL_REQUEST_CHECK_SKIP_ACTIONS).map(([identifier, action]) => ({
            identifier,
            label: action.label,
            description: action.description
          }))
        }
      : {})
  });

  // Annotations sent in later updates are appended to the ones already on the check run.
  for (const batch of remainingBatches) {
    // eslint-disable-next-line no-await-in-loop
    await octokit.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      output: { title: result.title, summary: result.summary, annotations: batch }
    });
  }
};

// The scan's outcome is already saved, so a check run that cannot be updated is logged rather than failing the scan.
export const tryCompletePullRequestCheckRun = async (
  params: TPullRequestCheckRunTarget & { result: TPullRequestCheckRunResult }
) => {
  try {
    await completePullRequestCheckRun(params);
  } catch (error) {
    logger.error(
      error,
      `secretScanningV2PullRequestScan: GitHub - failed to complete check run [repository=${params.repositoryFullName}] [checkRunId=${params.checkRunId}] [conclusion=${params.result.conclusion}]`
    );
  }
};

export const getPullRequestScanMetadata = (payload: TGitHubPullRequestScanPayload): TGitHubPullRequestScanMetadata => ({
  pullRequestNumber: payload.pullRequest.number,
  baseSha: payload.pullRequest.baseSha,
  headSha: payload.pullRequest.headSha,
  checkRunId: payload.checkRunId
});

// The scan's finding IDs are kept so a skip from the check run can triage exactly the findings it failed on.
export const createPullRequestScanReport = ({
  installationId,
  repositoryFullName,
  metadata,
  findingsUrl
}: {
  installationId: string;
  repositoryFullName: string;
  metadata: TGitHubPullRequestScanMetadata;
  findingsUrl?: string;
}): TSecretScanningScanReport => {
  const target = { installationId, repositoryFullName, checkRunId: metadata.checkRunId };

  return {
    start: async () => {
      try {
        await startPullRequestCheckRun(target);
      } catch (error) {
        logger.warn(
          error,
          `secretScanningV2PullRequestScan: GitHub - failed to mark check run in progress [repository=${repositoryFullName}] [checkRunId=${metadata.checkRunId}]`
        );
      }
    },
    getCompletedScanMetadata: ({ findings }) =>
      ({ ...metadata, findingIds: findings.map((finding) => finding.id) }) satisfies TGitHubPullRequestScanMetadata,
    // Judged on every finding in the pull request's commits, including ones an earlier push scan saved first.
    complete: ({ findings, details }) =>
      tryCompletePullRequestCheckRun({
        ...target,
        result: getPullRequestScanCheckRunResult({
          findings,
          scannedCommitCount: details?.scannedCommitCount ?? 0,
          totalCommitCount: details?.totalCommitCount ?? 0,
          findingsUrl
        })
      }),
    fail: ({ reason, isTimedOut }) =>
      tryCompletePullRequestCheckRun({
        ...target,
        result: getPullRequestScanFailedCheckRunResult(reason, isTimedOut ? "timed_out" : "failure")
      }),
    cancel: () => tryCompletePullRequestCheckRun({ ...target, result: PULL_REQUEST_SCAN_CANCELLED_CHECK_RUN_RESULT })
  };
};

// Runs in the secret scanning worker, so the webhook only has to enqueue the event.
export const processGitHubPullRequestEvent: TSecretScanningFactoryProcessEvent<TQueueGitHubPullRequestEvent> = async ({
  event,
  secretScanningV2DAL,
  auditLogService,
  discoverResource,
  queueReportedRealtimeScan
}) => {
  // Pull requests are checked only while the data source scans new commits. A repository the data source doesn't cover
  // yet is discovered the same way a push discovers it, or skipped when discovery is off. If the check run cannot be
  // created, usually because the installation has not accepted the Checks permission, there is nothing to report to
  // and nothing is scanned.
  const startPullRequestScan = async ({
    installationId,
    repository,
    pullRequest,
    isFromFork,
    expectedResourceId
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    pullRequest: TGitHubPullRequestScanPayload["pullRequest"];
    isFromFork?: boolean;
    expectedResourceId?: string;
  }) => {
    const logDetails = `[installationId=${installationId}] [repository=${repository.full_name}] [pullRequest=${pullRequest.number}] [headSha=${pullRequest.headSha}]`;

    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installationId),
      type: SecretScanningDataSource.GitHub
    });

    if (!dataSource) {
      logger.error(`secretScanningV2PullRequestEvent: GitHub - Could not find data source ${logDetails}`);
      return;
    }

    if (!dataSource.isScanNewCommitsEnabled) {
      logger.info(
        `secretScanningV2PullRequestEvent: GitHub - ignoring pull request, scanning new commits is disabled ${logDetails}`
      );
      return;
    }

    const existingResource = await secretScanningV2DAL.resources.findOne({
      dataSourceId: dataSource.id,
      externalId: String(repository.id)
    });

    if (!existingResource && !dataSource.isDiscoveryEnabled) {
      logger.info(
        `secretScanningV2PullRequestEvent: GitHub - ignoring pull request from unknown repository, discovery is disabled ${logDetails}`
      );
      return;
    }

    // Anyone can open a pull request from a fork of a public repository, so scanning one would let any GitHub account
    // spend the instance's scan workers and the installation's API quota, and plant findings in the org. The commits are
    // scanned once merged, by the push scan. Nothing is discovered either.
    if (isFromFork) {
      try {
        const created = await createSkippedPullRequestCheckRun({
          installationId: String(installationId),
          repositoryFullName: repository.full_name,
          headSha: pullRequest.headSha,
          title: "Fork not scanned",
          summary:
            "Infisical doesn't scan pull requests from forks. Their commits are scanned after they are merged into this repository."
        });

        if (!created) {
          logger.info(
            `secretScanningV2PullRequestEvent: GitHub - fork pull request head already has a check run, leaving it ${logDetails}`
          );
        }
      } catch (error) {
        logger.warn(
          error,
          `secretScanningV2PullRequestEvent: GitHub - could not create skipped check run for fork ${logDetails}`
        );
      }
      return;
    }

    const resource =
      existingResource ??
      (await discoverResource({
        dataSource,
        resourcePayload: { name: repository.full_name, externalId: String(repository.id) },
        trigger: SecretScanningScanTrigger.PullRequest
      }));

    if (!resource) return;

    if (expectedResourceId && expectedResourceId !== resource.id) {
      logger.warn(
        `secretScanningV2PullRequestEvent: GitHub - ignoring re-run, the scan belongs to another resource ${logDetails} [expectedResourceId=${expectedResourceId}] [resourceId=${resource.id}]`
      );
      return;
    }

    const scanId = crypto.nativeCrypto.randomUUID();
    const { SITE_URL } = getConfig();
    const orgId = dataSource.connection?.orgId;
    const findingsUrl =
      SITE_URL && orgId
        ? `${SITE_URL}/organizations/${orgId}/secret-scanning/findings?resourceId=${resource.id}`
        : undefined;

    let checkRunId: number;
    try {
      checkRunId = await createPullRequestCheckRun({
        installationId: String(installationId),
        repositoryFullName: repository.full_name,
        headSha: pullRequest.headSha,
        scanId,
        detailsUrl: findingsUrl
      });
    } catch (error) {
      logger.warn(
        error,
        `secretScanningV2PullRequestEvent: GitHub - could not create check run, skipping scan ${logDetails}`
      );
      return;
    }

    const payload: TGitHubPullRequestScanPayload = {
      installationId: String(installationId),
      repository: { id: repository.id, full_name: repository.full_name },
      pullRequest,
      checkRunId,
      findingsUrl
    };

    await queueReportedRealtimeScan({
      scanId,
      dataSourceId: dataSource.id,
      dataSourceType: SecretScanningDataSource.GitHub,
      resourceId: resource.id,
      trigger: SecretScanningScanTrigger.PullRequest,
      metadata: getPullRequestScanMetadata(payload),
      payload
    });
  };

  // A re-run carries no pull request for forks, so the pull request comes from the scan the check run was created for.
  const rerunPullRequestScan = async ({
    installationId,
    repository,
    externalId,
    logDetails
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    externalId: string | null;
    logDetails: string;
  }) => {
    const scanId = z.string().uuid().safeParse(externalId);

    if (!scanId.success) {
      logger.warn(`secretScanningV2CheckRunEvent: GitHub - check run has no scan ID ${logDetails}`);
      return;
    }

    // Primary: the event can arrive right after the scan completed, before a replica has its final metadata.
    const previousScan = await secretScanningV2DAL.scans.findById(scanId.data, secretScanningV2DAL.primaryNode());
    const metadata = GitHubPullRequestScanMetadataSchema.safeParse(previousScan?.metadata);

    if (!previousScan || previousScan.trigger !== SecretScanningScanTrigger.PullRequest || !metadata.success) {
      logger.info(
        `secretScanningV2CheckRunEvent: GitHub - ignoring re-run, the pull request scan no longer exists ${logDetails} [scanId=${scanId.data}]`
      );
      return;
    }

    await startPullRequestScan({
      installationId,
      repository,
      pullRequest: {
        number: metadata.data.pullRequestNumber,
        baseSha: metadata.data.baseSha,
        headSha: metadata.data.headSha
      },
      expectedResourceId: previousScan.resourceId
    });
  };

  // "Re-run all checks" names only the suite, so the scan comes from the newest check run of ours in it.
  const rerunCheckSuite = async ({
    installationId,
    repository,
    checkSuiteId
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    checkSuiteId: number;
  }) => {
    const logDetails = `[installationId=${installationId}] [repository=${repository.full_name}] [checkSuiteId=${checkSuiteId}]`;

    let externalId: string | null;
    try {
      externalId = await getLatestPullRequestCheckRunExternalId({
        installationId: String(installationId),
        repositoryFullName: repository.full_name,
        checkSuiteId
      });
    } catch (error) {
      logger.warn(
        error,
        `secretScanningV2CheckSuiteEvent: GitHub - could not list the suite's check runs ${logDetails}`
      );
      return;
    }

    if (!externalId) {
      logger.info(
        `secretScanningV2CheckSuiteEvent: GitHub - ignoring re-run, the suite has no pull request check ${logDetails}`
      );
      return;
    }

    await rerunPullRequestScan({ installationId, repository, externalId, logDetails });
  };

  // GitHub shows the skip buttons to anyone with write access to the repository, so the scan the check run names is
  // confirmed to belong to the installation and repository the event came from before any finding is changed. The
  // findings are then triaged as Infisical's own triage would, and the check is run again, which passes once every
  // finding in it is skipped.
  const skipPullRequestFindings = async ({
    installationId,
    repository,
    checkRunId,
    externalId,
    action,
    sender
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    checkRunId: number;
    externalId: string | null;
    action: string;
    sender: { id: number; login: string };
  }) => {
    const logDetails = `[installationId=${installationId}] [repository=${repository.full_name}] [checkRunId=${checkRunId}] [action=${action}] [sender=${sender.login}]`;

    if (!isPullRequestCheckSkipStatus(action)) {
      logger.warn(`secretScanningV2CheckRunEvent: GitHub - ignoring unknown check run action ${logDetails}`);
      return;
    }

    // Primary throughout: a click right after the check completes can reach a replica that still has the scan's queued
    // metadata, with no finding IDs, or no scan at all.
    const primary = secretScanningV2DAL.primaryNode();
    const scanId = z.string().uuid().safeParse(externalId);
    const previousScan = scanId.success ? await secretScanningV2DAL.scans.findById(scanId.data, primary) : undefined;
    const metadata = GitHubPullRequestScanMetadataSchema.safeParse(previousScan?.metadata);

    if (!previousScan || previousScan.trigger !== SecretScanningScanTrigger.PullRequest || !metadata.success) {
      logger.info(
        `secretScanningV2CheckRunEvent: GitHub - ignoring skip, the pull request scan no longer exists ${logDetails}`
      );
      return;
    }

    const resource = await secretScanningV2DAL.resources.findById(previousScan.resourceId, primary);
    const dataSource = resource
      ? await secretScanningV2DAL.dataSources.findById(resource.dataSourceId, primary)
      : undefined;

    if (
      !resource ||
      !dataSource ||
      dataSource.type !== SecretScanningDataSource.GitHub ||
      dataSource.externalId !== String(installationId) ||
      resource.externalId !== String(repository.id)
    ) {
      logger.warn(
        `secretScanningV2CheckRunEvent: GitHub - ignoring skip, the scan does not belong to this repository ${logDetails} [scanId=${previousScan.id}]`
      );
      return;
    }

    const { pullRequestNumber, findingIds = [] } = metadata.data;

    const findings = findingIds.length
      ? await secretScanningV2DAL.findings.find({ resourceId: resource.id, $in: { id: findingIds } }, { tx: primary })
      : [];
    const findingsToSkip = findings.filter((finding) => !isPullRequestCheckSkipStatus(finding.status));

    if (findingsToSkip.length) {
      const triageComment = `${
        action === SecretScanningFindingStatus.FalsePositive ? "Marked as a false positive" : "Ignored"
      } from GitHub by @${sender.login} on pull request ${repository.full_name}#${pullRequestNumber}.`;
      const now = new Date();

      await secretScanningV2DAL.findings.update(
        { $in: { id: findingsToSkip.map((finding) => finding.id) } },
        { status: action, triageComment, triagedAt: now, triagedByUserId: null, resolvedAt: null }
      );

      await Promise.all(
        findingsToSkip.map((finding) =>
          auditLogService.createAuditLog({
            projectId: dataSource.projectId,
            actor: {
              type: ActorType.PLATFORM,
              metadata: {}
            },
            event: {
              type: EventType.SECRET_SCANNING_FINDING_UPDATE,
              metadata: { findingId: finding.id, status: action, triageComment }
            }
          })
        )
      );

      logger.info(
        `secretScanningV2CheckRunEvent: GitHub - skipped pull request findings ${logDetails} [scanId=${previousScan.id}] [findings=${findingsToSkip.length}]`
      );
    }

    await startPullRequestScan({
      installationId,
      repository,
      pullRequest: {
        number: pullRequestNumber,
        baseSha: metadata.data.baseSha,
        headSha: metadata.data.headSha
      },
      expectedResourceId: resource.id
    });
  };

  const { installationId, repository } = event;

  switch (event.event) {
    case GitHubPullRequestEvent.PullRequest:
      return startPullRequestScan({
        installationId,
        repository,
        pullRequest: event.pullRequest,
        isFromFork: event.isFromFork
      });
    case GitHubPullRequestEvent.CheckRunRerequested:
      return rerunPullRequestScan({
        installationId,
        repository,
        externalId: event.externalId,
        logDetails: `[installationId=${installationId}] [repository=${repository.full_name}] [checkRunId=${event.checkRunId}]`
      });
    case GitHubPullRequestEvent.CheckSuiteRerequested:
      return rerunCheckSuite({ installationId, repository, checkSuiteId: event.checkSuiteId });
    case GitHubPullRequestEvent.CheckRunRequestedAction:
      return skipPullRequestFindings({
        installationId,
        repository,
        checkRunId: event.checkRunId,
        externalId: event.externalId,
        action: event.action,
        sender: event.sender
      });
    default:
      logger.error(
        `secretScanningV2PullRequestEvent: GitHub - unhandled event [event=${(event as { event: string }).event}]`
      );
  }
};
