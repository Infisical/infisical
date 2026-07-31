import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test, vi } from "vitest";

import {
  SecretScanningExecError,
  SecretScanningExecFailure,
  SecretScanningExecPhase
} from "@app/ee/services/secret-scanning/secret-scanning-exec";

import {
  assertClonedRepositoryWithinSizeLimit,
  parseScanErrorMessage,
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
