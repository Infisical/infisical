import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  SecretScanningFindingSeverity,
  SecretScanningFindingStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TFindingsPayload } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";

import {
  completePullRequestCheckRun,
  createSkippedPullRequestCheckRun,
  getPullRequestScanCheckRunResult,
  isGitHubPullRequestScanPayload,
  scanGitHubCommitsAndGetFindings
} from "./github-secret-scanning-fns";

type TCheckRunParams = {
  name?: string;
  conclusion?: string;
  output: { annotations: { message: string }[] };
  actions?: { identifier: string }[];
};

const checksUpdate = vi.fn<(params: TCheckRunParams) => Promise<void>>();
const checksCreate = vi.fn<(params: TCheckRunParams) => Promise<void>>();
const checksListForRef =
  vi.fn<(params: Record<string, unknown>) => Promise<{ data: { total_count: number; check_runs: unknown[] } }>>();

vi.mock("probot", () => ({
  ProbotOctokit: vi.fn(() => ({ checks: { update: checksUpdate, create: checksCreate, listForRef: checksListForRef } }))
}));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({
    INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: "1",
    INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: "key"
  })
}));

const scanContentAndGetFindings = vi.fn<(content: string, configPath?: string) => Promise<unknown[]>>();

vi.mock("@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns", () => ({
  scanContentAndGetFindings: (content: string, configPath?: string) => scanContentAndGetFindings(content, configPath)
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const SECRET_VALUE = "ghp_secretvalue1234567890";

const makeFinding = (index: number): TFindingsPayload[number] => ({
  rule: "github-pat",
  severity: SecretScanningFindingSeverity.High,
  fingerprint: `abc123:config|${index}.ts:github-pat:${index + 1}:4`,
  details: {
    description: "GitHub Personal Access Token.",
    startLine: index + 1,
    endLine: index + 1,
    startColumn: 4,
    endColumn: 30,
    file: `config|${index}.ts`,
    link: "",
    symlinkFile: "",
    commit: "abc123def4567890",
    entropy: 4.2,
    author: "Dev",
    email: "dev@example.com",
    date: "2026-10-28T00:00:00Z",
    message: `add token ${SECRET_VALUE}`,
    tags: [],
    ruleID: "github-pat",
    fingerprint: `abc123:config|${index}.ts:github-pat:${index + 1}:4`
  }
});

describe("isGitHubPullRequestScanPayload", () => {
  test("tells a pull request scan from a push", () => {
    expect(
      isGitHubPullRequestScanPayload({
        installationId: "1",
        repository: { id: 1, full_name: "acme/api" },
        pullRequest: { number: 7, baseSha: "base", headSha: "head" },
        checkRunId: 99
      })
    ).toBe(true);

    expect(isGitHubPullRequestScanPayload({ commits: [], repository: { id: 1, full_name: "acme/api" } } as never)).toBe(
      false
    );
  });
});

describe("getPullRequestScanCheckRunResult", () => {
  test("passes when every commit was scanned and nothing was found", () => {
    const result = getPullRequestScanCheckRunResult({ findings: [], scannedCommitCount: 3, totalCommitCount: 3 });

    expect(result.conclusion).toBe("success");
    expect(result.summary).toContain("Scanned 3 commit(s)");
  });

  test("does not pass a pull request whose commits were only partly scanned", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: [],
      scannedCommitCount: 2000,
      totalCommitCount: 2100
    });

    expect(result.conclusion).toBe("neutral");
    expect(result.summary).toContain("has 2100 commits");
  });

  test("fails on any finding and never includes the secret", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: [makeFinding(0), makeFinding(1)],
      scannedCommitCount: 2,
      totalCommitCount: 2
    });

    expect(result.conclusion).toBe("failure");
    expect(result.title).toBe("2 secret(s) found");
    expect(result.summary).toContain("| github-pat | config\\|0.ts | 1 | abc123d |");
    expect(result.summary).not.toContain(SECRET_VALUE);
  });

  test("passes when every finding was marked as a false positive or ignored", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: [
        { ...makeFinding(0), status: SecretScanningFindingStatus.FalsePositive },
        { ...makeFinding(1), status: SecretScanningFindingStatus.Ignore }
      ],
      scannedCommitCount: 1,
      totalCommitCount: 1
    });

    expect(result.conclusion).toBe("success");
    expect(result.title).toBe("2 secret(s) skipped");
    expect(result.offerSkipActions).toBeFalsy();
  });

  test("still fails on findings that were resolved or not triaged, and offers the skip actions", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: [
        { ...makeFinding(0), status: SecretScanningFindingStatus.FalsePositive },
        { ...makeFinding(1), status: SecretScanningFindingStatus.Resolved },
        { ...makeFinding(2), status: SecretScanningFindingStatus.Unresolved }
      ],
      scannedCommitCount: 1,
      totalCommitCount: 1
    });

    expect(result.conclusion).toBe("failure");
    expect(result.title).toBe("2 secret(s) found");
    expect(result.summary).toContain("1 more secret(s) were marked as false positives or ignored");
    expect(result.offerSkipActions).toBe(true);
  });

  test("caps the summary table and says how many findings it shows", () => {
    const findings = Array.from({ length: 60 }, (_, index) => makeFinding(index));
    const result = getPullRequestScanCheckRunResult({ findings, scannedCommitCount: 1, totalCommitCount: 1 });

    expect(result.summary).toContain("Showing 50 of 60 findings.");
    expect(result.summary.match(/\| github-pat \|/g)).toHaveLength(50);
  });
});

describe("completePullRequestCheckRun", () => {
  beforeEach(() => {
    checksUpdate.mockReset();
  });

  test("completes the check run and sends annotations in batches of 50", async () => {
    const findings = Array.from({ length: 120 }, (_, index) => makeFinding(index));

    await completePullRequestCheckRun({
      installationId: "1",
      repositoryFullName: "acme/api",
      checkRunId: 99,
      result: getPullRequestScanCheckRunResult({ findings, scannedCommitCount: 1, totalCommitCount: 1 })
    });

    expect(checksUpdate).toHaveBeenCalledTimes(3);

    const [first, second, third] = checksUpdate.mock.calls.map(([params]) => params);

    expect(first).toMatchObject({
      owner: "acme",
      repo: "api",
      check_run_id: 99,
      status: "completed",
      conclusion: "failure"
    });
    expect(first.output.annotations).toHaveLength(50);
    expect(second.output.annotations).toHaveLength(50);
    expect(second.conclusion).toBeUndefined();
    expect(third.output.annotations).toHaveLength(20);
    expect(first.actions?.map((action) => action.identifier)).toEqual([
      SecretScanningFindingStatus.FalsePositive,
      SecretScanningFindingStatus.Ignore
    ]);
    expect(second.actions).toBeUndefined();
    expect(first.output.annotations[0].message).toBe("GitHub Personal Access Token. Found in commit abc123d.");
    expect(JSON.stringify(checksUpdate.mock.calls)).not.toContain(SECRET_VALUE);
  });

  test("completes a check run with no findings in a single update", async () => {
    await completePullRequestCheckRun({
      installationId: "1",
      repositoryFullName: "acme/api",
      checkRunId: 99,
      result: getPullRequestScanCheckRunResult({ findings: [], scannedCommitCount: 1, totalCommitCount: 1 })
    });

    expect(checksUpdate).toHaveBeenCalledTimes(1);
    expect(checksUpdate.mock.calls[0][0]).toMatchObject({ conclusion: "success", output: { annotations: [] } });
    expect(checksUpdate.mock.calls[0][0].actions).toBeUndefined();
  });
});

describe("scanGitHubCommitsAndGetFindings", () => {
  beforeEach(() => {
    scanContentAndGetFindings.mockReset();
    scanContentAndGetFindings.mockResolvedValue([]);
  });

  test("scans the patch of every file except removed ones", async () => {
    const getCommit = vi.fn().mockResolvedValue({
      data: {
        files: ["added", "modified", "renamed", "copied", "changed", "removed"].map((status) => ({
          status,
          filename: `${status}.txt`,
          patch: `@@ -0,0 +1 @@\n+${status}`
        }))
      }
    });

    await scanGitHubCommitsAndGetFindings({
      octokit: { repos: { getCommit } } as unknown as Parameters<typeof scanGitHubCommitsAndGetFindings>[0]["octokit"],
      repositoryFullName: "acme/api",
      resourceName: "acme/api",
      commits: [{ sha: "a".repeat(40), authorName: "a", authorEmail: "a@a.com", date: "", message: "m" }]
    });

    const scanned = scanContentAndGetFindings.mock.calls.map(([content]) => content.trim());
    expect(scanned).toEqual(["added", "modified", "renamed", "copied", "changed"]);
  });

  const commit = { sha: "c".repeat(40), authorName: "a", authorEmail: "a@a.com", date: "", message: "m" };
  const makeFiles = (count: number, offset: number) =>
    Array.from({ length: count }, (_, index) => ({
      status: "modified",
      filename: `file-${offset + index}.txt`,
      patch: `@@ -0,0 +1 @@\n+file-${offset + index}`
    }));
  const asOctokit = (getCommit: unknown) =>
    ({ repos: { getCommit } }) as unknown as Parameters<typeof scanGitHubCommitsAndGetFindings>[0]["octokit"];

  test("scans every page of a commit's files", async () => {
    const getCommit = vi
      .fn()
      .mockResolvedValueOnce({ data: { files: makeFiles(100, 0) } })
      .mockResolvedValueOnce({ data: { files: makeFiles(100, 100) } })
      .mockResolvedValueOnce({ data: { files: makeFiles(5, 200) } });

    await scanGitHubCommitsAndGetFindings({
      octokit: asOctokit(getCommit),
      repositoryFullName: "acme/api",
      resourceName: "acme/api",
      commits: [commit],
      requireCompleteCommits: true
    });

    expect(getCommit).toHaveBeenCalledTimes(3);
    expect(getCommit).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, per_page: 100 }));
    expect(scanContentAndGetFindings).toHaveBeenCalledTimes(205);
  });

  test("fails a scan that requires every file when a commit has more files than GitHub lists", async () => {
    let page = 0;
    const getCommit = vi.fn().mockImplementation(() => {
      page += 1;
      return Promise.resolve({ data: { files: makeFiles(100, (page - 1) * 100) } });
    });

    await expect(
      scanGitHubCommitsAndGetFindings({
        octokit: asOctokit(getCommit),
        repositoryFullName: "acme/api",
        resourceName: "acme/api",
        commits: [commit],
        requireCompleteCommits: true
      })
    ).rejects.toThrow("changes more than 3,000 files");

    expect(getCommit).toHaveBeenCalledTimes(30);
    expect(scanContentAndGetFindings).not.toHaveBeenCalled();
  });

  test("scans the files GitHub lists when the scan doesn't require every file", async () => {
    let page = 0;
    const getCommit = vi.fn().mockImplementation(() => {
      page += 1;
      return Promise.resolve({ data: { files: makeFiles(100, (page - 1) * 100) } });
    });

    await scanGitHubCommitsAndGetFindings({
      octokit: asOctokit(getCommit),
      repositoryFullName: "acme/api",
      resourceName: "acme/api",
      commits: [commit]
    });

    expect(scanContentAndGetFindings).toHaveBeenCalledTimes(3000);
  });
});

describe("createSkippedPullRequestCheckRun", () => {
  const params = {
    installationId: "1",
    repositoryFullName: "acme/api",
    headSha: "b".repeat(40),
    title: "Fork not scanned",
    summary: "summary"
  };

  beforeEach(() => {
    checksCreate.mockReset();
    checksListForRef.mockReset();
  });

  test("creates a check with the scan's name, already completed as skipped, with no scan behind it", async () => {
    checksListForRef.mockResolvedValue({ data: { total_count: 0, check_runs: [] } });

    expect(await createSkippedPullRequestCheckRun(params)).toBe(true);

    expect(checksListForRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "b".repeat(40), check_name: "Infisical Secret Scanning", app_id: 1 })
    );
    expect(checksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "api",
        name: "Infisical Secret Scanning",
        head_sha: "b".repeat(40),
        status: "completed",
        conclusion: "skipped"
      })
    );
    expect(checksCreate.mock.calls[0][0]).not.toHaveProperty("external_id");
  });

  test("leaves a commit that a scan already reported on alone", async () => {
    checksListForRef.mockResolvedValue({ data: { total_count: 1, check_runs: [{ id: 7 }] } });

    expect(await createSkippedPullRequestCheckRun(params)).toBe(false);
    expect(checksCreate).not.toHaveBeenCalled();
  });
});
