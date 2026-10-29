import { ProbotOctokit } from "probot";

import {
  SecretScanningFindingSeverity,
  SecretScanningFindingStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  convertPatchLineToFileLineNumber,
  replaceNonChangesWithNewlines,
  toFindingDetails
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import { GitRepositoryScanFindingDetailsSchema } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import {
  TFindingsPayload,
  TQueueSecretScanningResourceDiffScan
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { getConfig } from "@app/lib/config/env";
import { chunkArray } from "@app/lib/fn/array";
import { logger } from "@app/lib/logger";

import { TGitHubPullRequestScanPayload } from "./github-secret-scanning-types";

export const GITHUB_PULL_REQUEST_CHECK_NAME = "Infisical Secret Scanning";

const COMPARE_COMMITS_PER_PAGE = 100;
const COMPARE_COMMITS_MAX_PAGES = 20;
// GitHub rejects a check run update carrying more than 50 annotations; more are sent as further updates.
const CHECK_RUN_ANNOTATIONS_PER_REQUEST = 50;
const CHECK_RUN_MAX_ANNOTATIONS = 500;
const CHECK_RUN_MAX_SUMMARY_FINDINGS = 50;

type TGitHubOctokit = InstanceType<typeof ProbotOctokit>;

type TGitHubCommitToScan = {
  sha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
};

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

export const scanGitHubCommitsAndGetFindings = async ({
  octokit,
  repositoryFullName,
  resourceName,
  commits,
  configPath
}: {
  octokit: TGitHubOctokit;
  repositoryFullName: string;
  resourceName: string;
  commits: TGitHubCommitToScan[];
  configPath?: string;
}): Promise<TFindingsPayload> => {
  const { owner, repo } = splitRepositoryFullName(repositoryFullName);

  const allFindings: SecretMatch[] = [];

  for (const commit of commits) {
    // eslint-disable-next-line no-await-in-loop
    const commitData = await octokit.repos.getCommit({
      owner,
      repo,
      ref: commit.sha
    });

    // eslint-disable-next-line no-continue
    if (!commitData.data.files) continue;

    for (const file of commitData.data.files) {
      if ((file.status === "added" || file.status === "modified") && file.patch) {
        // eslint-disable-next-line
        const findings = await scanContentAndGetFindings(replaceNonChangesWithNewlines(`\n${file.patch}`), configPath);

        const adjustedFindings = findings.map((finding) => {
          const startLine = convertPatchLineToFileLineNumber(file.patch!, finding.StartLine);
          const endLine =
            finding.StartLine === finding.EndLine
              ? startLine
              : convertPatchLineToFileLineNumber(file.patch!, finding.EndLine);
          const startColumn = finding.StartColumn - 1; // subtract 1 for +
          const endColumn = finding.EndColumn - 1; // subtract 1 for +

          return {
            ...finding,
            StartLine: startLine,
            EndLine: endLine,
            StartColumn: startColumn,
            EndColumn: endColumn,
            File: file.filename,
            Commit: commit.sha,
            Author: commit.authorName,
            Email: commit.authorEmail,
            Message: commit.message,
            Fingerprint: `${commit.sha}:${file.filename}:${finding.RuleID}:${startLine}:${startColumn}`,
            Date: commit.date,
            Attributes: {
              ...finding.Attributes,
              url: `https://github.com/${resourceName}/blob/${commit.sha}/${file.filename}#L${startLine}`
            }
          };
        });

        allFindings.push(...adjustedFindings);
      }
    }
  }

  return allFindings.map((finding) => ({
    details: toFindingDetails(finding),
    fingerprint: finding.Fingerprint,
    severity: SecretScanningFindingSeverity.High,
    rule: finding.RuleID
  }));
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
}) => {
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
    configPath
  });

  return { findings, scannedCommitCount: commits.length, totalCommitCount: totalCommits };
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
  description: true
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

export const getPullRequestScanCheckRunResult = ({
  findings: allFindings,
  scannedCommitCount,
  totalCommitCount
}: {
  findings: (TFindingsPayload[number] & { status?: string | null })[];
  scannedCommitCount: number;
  totalCommitCount: number;
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

  const table = [
    "| Rule | File | Line | Commit |",
    "| --- | --- | --- | --- |",
    ...getFindingLocations(findings.slice(0, CHECK_RUN_MAX_SUMMARY_FINDINGS)).map(
      ({ rule, file, startLine, commit }) =>
        `| ${escapeMarkdownTableCell(rule)} | ${escapeMarkdownTableCell(file)} | ${startLine} | ${commit.slice(0, 7)} |`
    )
  ].join("\n");

  const summary = [
    `Found ${findings.length} secret(s) in the commits of this pull request. Rotate each secret, then remove it from the pull request's history.`,
    "If the findings are false positives or safe to ignore, use Skip: False positive or Skip: Ignore above to mark them in Infisical and re-run this check. To stop a value from being reported anywhere, add it to the allowlist in your Infisical secret scanning configuration.",
    skippedCount ? `${skippedCount} more secret(s) were marked as false positives or ignored in Infisical.` : "",
    truncationNote,
    table,
    findings.length > CHECK_RUN_MAX_SUMMARY_FINDINGS
      ? `Showing ${CHECK_RUN_MAX_SUMMARY_FINDINGS} of ${findings.length} findings.`
      : ""
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
