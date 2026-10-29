import { beforeEach, describe, expect, test, vi } from "vitest";

import { SecretScanningFindingSeverity } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TFindingsPayload } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";

import {
  completePullRequestCheckRun,
  getPullRequestScanCheckRunResult,
  isGitHubPullRequestScanPayload
} from "./github-secret-scanning-fns";

const checksUpdate = vi.fn();

vi.mock("probot", () => ({
  ProbotOctokit: vi.fn(() => ({ checks: { update: checksUpdate } }))
}));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({
    INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: "1",
    INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: "key"
  })
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
    description: "GitHub Personal Access Token",
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
  });
});
