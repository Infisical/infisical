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
    INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: "key",
    SECRET_SCANNING_SCAN_TIMEOUT: 60_000
  })
}));

const scanContents =
  vi.fn<(contents: string[], configPath?: string) => Promise<{ index: number; finding: Record<string, unknown> }[]>>();

vi.mock("@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns", () => ({
  scanContentsAndGetFindings: async <T>(items: T[], getContent: (item: T) => string, configPath?: string) => {
    const results = await scanContents(items.map(getContent), configPath);
    return results.map(({ index, finding }) => ({ item: items[index], finding }));
  }
}));

const scannedContents = () => scanContents.mock.calls.flatMap(([contents]) => contents);

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

describe("getPullRequestScanCheckRunResult", () => {
  test("fails on any finding and never includes the secret", () => {
    const finding = makeFinding(0);
    const result = getPullRequestScanCheckRunResult({
      findings: [
        {
          ...finding,
          id: "0a1b2c3d-0000-4000-8000-000000000000",
          status: SecretScanningFindingStatus.Unresolved,
          details: {
            ...(finding.details as object),
            link: "https://github.com/acme/api/blob/abc123/my dir/config|0.ts#L1"
          }
        },
        makeFinding(1)
      ],
      scannedCommitCount: 2,
      totalCommitCount: 2,
      findingsUrl: "https://app.infisical.com/organizations/org/secret-scanning/findings?resourceId=r"
    });

    expect(result.conclusion).toBe("failure");
    expect(result.title).toBe("2 secret(s) found");
    expect(result.summary).toContain(
      "| [0a1b2c3d](https://app.infisical.com/organizations/org/secret-scanning/findings?resourceId=r) | Unresolved | github-pat | abc123d | config\\|0.ts:1 | [View secret](https://github.com/acme/api/blob/abc123/my%20dir/config%7C0.ts#L1) |"
    );
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

  const makeLongPathFindings = (count: number, pathLength: number) =>
    Array.from({ length: count }, (_, index) => {
      const finding = makeFinding(index);
      const file = `${"d/".repeat(pathLength / 2)}${index}.ts`;
      return {
        ...finding,
        id: `${index}`.padStart(8, "0").concat("-0000-4000-8000-000000000000"),
        details: { ...(finding.details as object), file, link: `https://github.com/acme/api/blob/abc123/${file}#L1` }
      };
    });

  test("drops the links to keep every finding listed within GitHub's summary length limit", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: makeLongPathFindings(50, 600),
      scannedCommitCount: 1,
      totalCommitCount: 1,
      findingsUrl: "https://app.infisical.com/organizations/org/secret-scanning/findings?resourceId=r"
    });

    expect(result.summary.length).toBeLessThanOrEqual(65_535);
    expect(result.summary.match(/^\| \d{8} \| Unresolved /gm)).toHaveLength(50);
    expect(result.summary).not.toContain("](");
    expect(result.summary).not.toContain("Showing");
  });

  test("keeps the links when the full table fits", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: makeLongPathFindings(50, 100),
      scannedCommitCount: 1,
      totalCommitCount: 1,
      findingsUrl: "https://app.infisical.com/organizations/org/secret-scanning/findings?resourceId=r"
    });

    expect(result.summary.match(/\[View secret\]/g)).toHaveLength(50);
  });

  test("stops the table and says how many findings it shows once rows no longer fit", () => {
    const result = getPullRequestScanCheckRunResult({
      findings: makeLongPathFindings(50, 3000),
      scannedCommitCount: 1,
      totalCommitCount: 1
    });

    const shownCount = Number(result.summary.match(/Showing (\d+) of 50 findings\./)?.[1]);
    expect(result.summary.length).toBeLessThanOrEqual(65_535);
    expect(shownCount).toBeGreaterThan(0);
    expect(shownCount).toBeLessThan(50);
    expect(result.summary.match(/^\| \d{8} \|/gm)).toHaveLength(shownCount);
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

    expect(first).toMatchObject({ status: "completed", conclusion: "failure" });
    expect([first, second, third].map((params) => params.output.annotations.length)).toEqual([50, 50, 20]);
    expect(first.actions?.map((action) => action.identifier)).toEqual([
      SecretScanningFindingStatus.FalsePositive,
      SecretScanningFindingStatus.Ignore
    ]);
    expect(second.actions).toBeUndefined();
    expect(JSON.stringify(checksUpdate.mock.calls)).not.toContain(SECRET_VALUE);
  });
});

describe("scanGitHubCommitsAndGetFindings", () => {
  beforeEach(() => {
    scanContents.mockReset();
    scanContents.mockResolvedValue([]);
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
      octokit: asOctokit(getCommit),
      repositoryFullName: "acme/api",
      resourceName: "acme/api",
      commits: [commit]
    });

    const scanned = scannedContents().map((content) => content.trim());
    expect(scanned).toEqual(["added", "modified", "renamed", "copied", "changed"]);
  });

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
    expect(scannedContents()).toHaveLength(205);
  });

  test("scans files in batches of 50 and maps a later batch's finding back to its file", async () => {
    const secondCommit = { ...commit, sha: "d".repeat(40), authorName: "b" };
    const getCommit = vi
      .fn()
      .mockImplementation(({ ref }: { ref: string }) =>
        Promise.resolve({ data: { files: makeFiles(30, ref === commit.sha ? 0 : 30) } })
      );
    scanContents
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { index: 2, finding: { RuleID: "rule", StartLine: 2, EndLine: 2, StartColumn: 2, EndColumn: 4 } }
      ]);

    const findings = await scanGitHubCommitsAndGetFindings({
      octokit: asOctokit(getCommit),
      repositoryFullName: "acme/api",
      resourceName: "acme/api",
      commits: [commit, secondCommit]
    });

    expect(scanContents.mock.calls.map(([contents]) => contents.length)).toEqual([50, 10]);
    expect(findings).toHaveLength(1);
    expect(findings[0].fingerprint).toBe(`${secondCommit.sha}:file-52.txt:rule:1:1`);
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
    expect(scannedContents()).toEqual([]);
  });

  test("scans every commit's files in one scan and maps each finding back to its file", async () => {
    const secondCommit = { ...commit, sha: "d".repeat(40), authorName: "b" };
    const getCommit = vi.fn().mockImplementation(({ ref }: { ref: string }) =>
      Promise.resolve({
        data: {
          files: [
            { status: "modified", filename: `${ref.slice(0, 1)}-one.txt`, patch: "@@ -1,0 +5,1 @@\n+one" },
            { status: "added", filename: `${ref.slice(0, 1)}-two.txt`, patch: "@@ -0,0 +1,2 @@\n+safe\n+two" }
          ]
        }
      })
    );
    scanContents.mockResolvedValue([
      { index: 3, finding: { RuleID: "rule", StartLine: 3, EndLine: 3, StartColumn: 2, EndColumn: 4 } }
    ]);

    const findings = await scanGitHubCommitsAndGetFindings({
      octokit: asOctokit(getCommit),
      repositoryFullName: "acme/api",
      resourceName: "acme/api",
      commits: [commit, secondCommit]
    });

    expect(scanContents).toHaveBeenCalledTimes(1);
    expect(scannedContents()).toHaveLength(4);
    expect(findings).toHaveLength(1);
    expect(findings[0].fingerprint).toBe(`${secondCommit.sha}:d-two.txt:rule:2:1`);
    expect(findings[0].details).toEqual(
      expect.objectContaining({ file: "d-two.txt", commit: secondCommit.sha, author: "b", startLine: 2 })
    );
  });

  describe("a file whose patch GitHub left out", () => {
    const parentSha = "p".repeat(40);
    const toContent = (text: string) => ({
      data: {
        type: "file",
        size: text.length,
        sha: "s",
        encoding: "base64",
        content: Buffer.from(text).toString("base64")
      }
    });
    const asOctokitWithContents = (
      files: unknown[],
      getContent: unknown,
      getBlob: unknown = vi.fn()
    ): Parameters<typeof scanGitHubCommitsAndGetFindings>[0]["octokit"] =>
      ({
        repos: { getCommit: vi.fn().mockResolvedValue({ data: { files, parents: [{ sha: parentSha }] } }), getContent },
        git: { getBlob }
      }) as unknown as Parameters<typeof scanGitHubCommitsAndGetFindings>[0]["octokit"];
    const scannedLines = () => scannedContents().map((content) => content.split("\n").filter(Boolean));

    test("scans every line of an added file", async () => {
      const getContent = vi.fn().mockResolvedValue(toContent("one\ntwo\n"));

      await scanGitHubCommitsAndGetFindings({
        octokit: asOctokitWithContents([{ status: "added", filename: "big.txt", additions: 2 }], getContent),
        repositoryFullName: "acme/api",
        resourceName: "acme/api",
        commits: [commit]
      });

      expect(getContent).toHaveBeenCalledTimes(1);
      expect(getContent).toHaveBeenCalledWith(expect.objectContaining({ path: "big.txt", ref: commit.sha }));
      expect(scannedLines()).toEqual([["one", "two"]]);
    });

    test("scans only the lines a modified or renamed file adds", async () => {
      const getContent = vi
        .fn()
        .mockImplementation(({ ref }: { ref: string }) =>
          Promise.resolve(toContent(ref === parentSha ? "kept\nold\n" : "kept\nnew\n"))
        );

      await scanGitHubCommitsAndGetFindings({
        octokit: asOctokitWithContents(
          [{ status: "renamed", filename: "new.txt", previous_filename: "old.txt", additions: 1 }],
          getContent
        ),
        repositoryFullName: "acme/api",
        resourceName: "acme/api",
        commits: [commit]
      });

      expect(getContent).toHaveBeenCalledWith(expect.objectContaining({ path: "old.txt", ref: parentSha }));
      expect(scannedLines()).toEqual([["new"]]);
    });

    test("reads a file over 1 MB from the blob API", async () => {
      const getContent = vi
        .fn()
        .mockResolvedValue({ data: { type: "file", size: 2_000_000, sha: "blob", content: "" } });
      const getBlob = vi.fn().mockResolvedValue({ data: { content: Buffer.from("large\n").toString("base64") } });

      await scanGitHubCommitsAndGetFindings({
        octokit: asOctokitWithContents([{ status: "added", filename: "big.txt", additions: 1 }], getContent, getBlob),
        repositoryFullName: "acme/api",
        resourceName: "acme/api",
        commits: [commit]
      });

      expect(getBlob).toHaveBeenCalledWith(expect.objectContaining({ file_sha: "blob" }));
      expect(scannedLines()).toEqual([["large"]]);
    });

    test("skips a binary file, which adds no lines", async () => {
      const getContent = vi.fn();

      await scanGitHubCommitsAndGetFindings({
        octokit: asOctokitWithContents([{ status: "added", filename: "image.png", additions: 0 }], getContent),
        repositoryFullName: "acme/api",
        resourceName: "acme/api",
        commits: [commit],
        requireCompleteCommits: true
      });

      expect(getContent).not.toHaveBeenCalled();
      expect(scannedContents()).toEqual([]);
    });

    test("fails a scan that requires every file when the file is too large to fetch, and skips it otherwise", async () => {
      const getContent = vi
        .fn()
        .mockResolvedValue({ data: { type: "file", size: 50_000_000, sha: "blob", content: "" } });
      const files = [{ status: "added", filename: "huge.txt", additions: 1 }];

      await expect(
        scanGitHubCommitsAndGetFindings({
          octokit: asOctokitWithContents(files, getContent),
          repositoryFullName: "acme/api",
          resourceName: "acme/api",
          commits: [commit],
          requireCompleteCommits: true
        })
      ).rejects.toThrow("huge.txt is too large for GitHub to include, and the file couldn't be scanned in full");

      await expect(
        scanGitHubCommitsAndGetFindings({
          octokit: asOctokitWithContents(files, getContent),
          repositoryFullName: "acme/api",
          resourceName: "acme/api",
          commits: [commit]
        })
      ).resolves.toEqual([]);

      expect(scannedContents()).toEqual([]);
    });
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

  // Same name as the scan's check, so a required check passes on a fork's pull request.
  test("creates a skipped check under the scan's check name", async () => {
    checksListForRef.mockResolvedValue({ data: { total_count: 0, check_runs: [] } });

    expect(await createSkippedPullRequestCheckRun(params)).toBe(true);
    expect(checksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Infisical Secret Scanning", status: "completed", conclusion: "skipped" })
    );
  });

  test("leaves a commit that a scan already reported on alone", async () => {
    checksListForRef.mockResolvedValue({ data: { total_count: 1, check_runs: [{ id: 7 }] } });

    expect(await createSkippedPullRequestCheckRun(params)).toBe(false);
    expect(checksCreate).not.toHaveBeenCalled();
  });
});
