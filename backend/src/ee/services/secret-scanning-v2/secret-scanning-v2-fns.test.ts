import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { describe, expect, test, vi } from "vitest";

import {
  SecretScanningExecError,
  SecretScanningExecFailure,
  SecretScanningExecPhase
} from "@app/ee/services/secret-scanning/secret-scanning-exec";

import {
  assertClonedRepositoryWithinSizeLimit,
  parseScanErrorMessage,
  planCommitBatches,
  SecretScanningSizeLimitError
} from "./secret-scanning-v2-fns";

// getConfig is read lazily inside the functions under test; only the size limit matters here.
const mockConfig = { SECRET_SCANNING_MAX_REPO_SIZE_MB: 5120 };

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe("parseScanErrorMessage", () => {
  test("maps a scan timeout to an actionable message without leaking the command line", () => {
    const message = parseScanErrorMessage(
      new SecretScanningExecError({
        failure: SecretScanningExecFailure.Timeout,
        phase: SecretScanningExecPhase.Scan,
        command: "infisical",
        output: "scanning /tmp/infisical-scan-yunqhI",
        timeoutMs: 10 * 60 * 1000
      })
    );

    expect(message).toContain("10 minute time limit");
    expect(message).not.toContain("infisical scan");
    expect(message).not.toContain("/tmp/infisical-scan-yunqhI");
  });

  test("distinguishes a clone timeout from a scan timeout", () => {
    const message = parseScanErrorMessage(
      new SecretScanningExecError({
        failure: SecretScanningExecFailure.Timeout,
        phase: SecretScanningExecPhase.Clone,
        command: "git",
        output: "",
        timeoutMs: 10 * 60 * 1000
      })
    );

    expect(message).toContain("Cloning the repository");
  });

  test("does not describe a size measurement as a clone failure", () => {
    // Both run `git`, so the phase is the only thing separating them. Reporting a count-objects
    // timeout as a clone timeout sends the customer chasing credentials that are fine.
    const message = parseScanErrorMessage(
      new SecretScanningExecError({
        failure: SecretScanningExecFailure.Timeout,
        phase: SecretScanningExecPhase.Measure,
        command: "git",
        output: "",
        timeoutMs: 30_000
      })
    );

    expect(message).toContain("could not be measured");
    expect(message).not.toContain("Cloning");
    expect(message).not.toContain("credentials");
  });

  test("maps a rejected clone to a credentials message", () => {
    const message = parseScanErrorMessage(
      new SecretScanningExecError({
        failure: SecretScanningExecFailure.ExitCode,
        phase: SecretScanningExecPhase.Clone,
        command: "git",
        output:
          "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/acme/app.git/'",
        exitCode: 128
      })
    );

    expect(message).toContain("denied access");
    // The remote URL carries an embedded access token in the real failure — it must not survive.
    expect(message).not.toContain("https://");
  });

  test("passes the size limit message through — it is written for the customer", () => {
    const message = parseScanErrorMessage(new SecretScanningSizeLimitError("acme/monorepo", 12_000, 5_120));

    expect(message).toContain("acme/monorepo");
    expect(message).toContain("5120 MB scanning limit");
  });

  test("renders sub-minute ceilings in seconds instead of a rounded zero", () => {
    const message = parseScanErrorMessage(
      new SecretScanningExecError({
        failure: SecretScanningExecFailure.Timeout,
        phase: SecretScanningExecPhase.Scan,
        command: "infisical",
        output: "",
        timeoutMs: 3_000
      })
    );

    expect(message).toContain("3 second time limit");
    expect(message).not.toContain("0 minute");
  });

  test("truncates an oversized message", () => {
    const message = parseScanErrorMessage(new Error("x".repeat(2000)));

    expect(message).toHaveLength(1024);
    expect(message.endsWith("...")).toBe(true);
  });
});

describe("assertClonedRepositoryWithinSizeLimit", () => {
  // `git count-objects` in a plain directory exits 128, standing in for any measurement failure.
  test("fails open when the size limit is disabled and the measurement cannot run", async () => {
    mockConfig.SECRET_SCANNING_MAX_REPO_SIZE_MB = 0;
    const dir = await mkdtemp(join(tmpdir(), "e2e-not-a-repo-"));

    try {
      await expect(assertClonedRepositoryWithinSizeLimit("acme/app", dir)).resolves.toBeUndefined();
    } finally {
      mockConfig.SECRET_SCANNING_MAX_REPO_SIZE_MB = 5120;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fails closed when the limit is enforced and the measurement cannot run", async () => {
    mockConfig.SECRET_SCANNING_MAX_REPO_SIZE_MB = 5120;
    const dir = await mkdtemp(join(tmpdir(), "e2e-not-a-repo-"));

    try {
      await expect(assertClonedRepositoryWithinSizeLimit("acme/app", dir)).rejects.toBeInstanceOf(
        SecretScanningExecError
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("planCommitBatches", () => {
  const exec = promisify(execFile);

  const git = (repoPath: string, args: string[], date?: string) =>
    exec("git", args, {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@example.com",
        ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {})
      }
    });

  const commit = async (repoPath: string, name: string, date: string) => {
    await writeFile(join(repoPath, `${name}.txt`), name);
    await git(repoPath, ["add", "."], date);
    await git(repoPath, ["commit", "-m", name], date);
    const { stdout } = await git(repoPath, ["rev-parse", "HEAD"]);
    return stdout.trim();
  };

  const withRepo = async (run: (repoPath: string) => Promise<void>) => {
    const repoPath = await mkdtemp(join(tmpdir(), "plan-commit-batches-"));

    try {
      await git(repoPath, ["init", "--initial-branch=main"]);
      await run(repoPath);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  };

  test("resumes past the commits it already scanned", async () => {
    await withRepo(async (repoPath) => {
      await commit(repoPath, "a", "2020-01-01T00:00:00Z");
      await commit(repoPath, "b", "2020-01-02T00:00:00Z");
      await commit(repoPath, "c", "2020-01-03T00:00:00Z");
      await commit(repoPath, "d", "2020-01-04T00:00:00Z");

      const first = await planCommitBatches({ repoPath, batchSize: 2 });

      expect(first.totalCommits).toBe(4);
      expect(first.batches).toHaveLength(2);

      const [firstBatch] = first.batches;

      const resumed = await planCommitBatches({
        repoPath,
        batchSize: 2,
        resumeAfterCommit: firstBatch.lastCommit,
        resumeAfterCommitDigest: firstBatch.prefixDigest
      });

      expect(resumed.resumed).toBe(true);
      expect(resumed.batches).toEqual(first.batches.slice(1));
    });
  });

  test("enumerates the default branch only", async () => {
    await withRepo(async (repoPath) => {
      await commit(repoPath, "a", "2020-01-01T00:00:00Z");
      await commit(repoPath, "b", "2020-01-02T00:00:00Z");

      // Never merged, so it is not part of the default branch's history. Commits that only ever
      // existed on another branch are covered by realtime scanning of the push that created them.
      await git(repoPath, ["checkout", "-b", "feature"]);
      await commit(repoPath, "unmerged", "2020-01-03T00:00:00Z");
      await git(repoPath, ["checkout", "main"]);

      const plan = await planCommitBatches({ repoPath, batchSize: 10 });

      expect(plan.totalCommits).toBe(2);
    });
  });

  test("restarts when a merge lands commits ahead of the resume point", async () => {
    await withRepo(async (repoPath) => {
      await commit(repoPath, "a", "2020-01-01T00:00:00Z");
      await commit(repoPath, "b", "2020-01-02T00:00:00Z");
      await commit(repoPath, "c", "2020-01-03T00:00:00Z");
      await commit(repoPath, "d", "2020-01-04T00:00:00Z");

      const [firstBatch] = (await planCommitBatches({ repoPath, batchSize: 2 })).batches;

      // A long-lived branch rooted before the resume point, merged in afterwards. Its commit keeps
      // its own older date, so the date ordering sorts it into the prefix and shifts every index
      // after it — on the default branch alone, with no second ref involved.
      await git(repoPath, ["checkout", "-b", "feature", "HEAD~3"]);
      const merged = await commit(repoPath, "feat-old", "2020-01-01T12:00:00Z");
      await git(repoPath, ["checkout", "main"]);
      await git(repoPath, ["merge", "--no-ff", "feature", "-m", "merge feature"]);

      const resumed = await planCommitBatches({
        repoPath,
        batchSize: 2,
        resumeAfterCommit: firstBatch.lastCommit,
        resumeAfterCommitDigest: firstBatch.prefixDigest
      });

      expect(resumed.resumed).toBe(false);

      // Every commit is back in the plan, the never-scanned one included.
      const planned = resumed.batches.reduce((total, batch) => total + batch.maxCount, 0);
      expect(resumed.totalCommits).toBe(6);
      expect(planned).toBe(6);
      expect(merged).toBeTruthy();
    });
  });

  test("restarts when the resume point has left the repository", async () => {
    await withRepo(async (repoPath) => {
      await commit(repoPath, "a", "2020-01-01T00:00:00Z");
      await commit(repoPath, "b", "2020-01-02T00:00:00Z");

      const plan = await planCommitBatches({
        repoPath,
        batchSize: 1,
        resumeAfterCommit: "0000000000000000000000000000000000000000",
        resumeAfterCommitDigest: "stale"
      });

      expect(plan.resumed).toBe(false);
      expect(plan.batches).toHaveLength(2);
    });
  });
});
