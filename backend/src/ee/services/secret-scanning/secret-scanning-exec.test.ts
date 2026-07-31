import { execFile } from "child_process";
import { promisify } from "util";
import { describe, expect, test, vi } from "vitest";

import {
  execFileBounded,
  getGitThreadLimitArgs,
  getScannerProcessEnv,
  SecretScanningExecError,
  SecretScanningExecFailure,
  SecretScanningExecPhase
} from "./secret-scanning-exec";

// getConfig is read lazily inside the env/argv helpers; only the resource caps matter here.
const mockConfig = { SECRET_SCANNING_MEMORY_LIMIT_MB: 2048, SECRET_SCANNING_CPU_THREADS: 1 };

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

const execFileAsync = promisify(execFile);

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("execFileBounded", () => {
  test("resolves with captured output on success", async () => {
    const output = await execFileBounded("sh", ["-c", "echo hello"], {
      phase: SecretScanningExecPhase.Scan,
      timeoutMs: 10_000
    });

    expect(output.trim()).toBe("hello");
  });

  test("treats a configured non-zero exit code as success", async () => {
    await expect(
      execFileBounded("sh", ["-c", "exit 77"], {
        phase: SecretScanningExecPhase.Scan,
        timeoutMs: 10_000,
        successExitCodes: [0, 77]
      })
    ).resolves.toBeDefined();
  });

  test("rejects with the exit code and captured output on failure", async () => {
    const error = await execFileBounded("sh", ["-c", "echo boom >&2; exit 3"], {
      phase: SecretScanningExecPhase.Scan,
      timeoutMs: 10_000
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretScanningExecError);
    const execError = error as SecretScanningExecError;
    expect(execError.failure).toBe(SecretScanningExecFailure.ExitCode);
    expect(execError.exitCode).toBe(3);
    expect(execError.output).toContain("boom");
    // The command line and output must not leak into the message — it reaches the customer.
    expect(execError.message).not.toContain("boom");
  });

  test("redacts credentials embedded in a URL out of the retained output", async () => {
    // What a clone against a rejected token can print: the remote URL carries the credential
    // inline, and `output` ends up in logs wherever the error object is serialized.
    const error = await execFileBounded(
      "sh",
      [
        "-c",
        "echo \"fatal: could not read from 'https://x-access-token:ghs_supersecret@github.com/acme/app.git'\" >&2; exit 128"
      ],
      { phase: SecretScanningExecPhase.Clone, timeoutMs: 10_000 }
    ).catch((err: unknown) => err);

    const execError = error as SecretScanningExecError;
    expect(execError.output).not.toContain("ghs_supersecret");
    expect(execError.output).not.toContain("x-access-token");
    // The rest of the line survives: it is what tells an operator what actually failed.
    expect(execError.output).toContain("github.com/acme/app.git");
  });

  test("decodes multi-byte output split across chunk boundaries", async () => {
    // The two halves of a 3-byte character are written separately, so a per-chunk toString would
    // turn one character into replacement characters. Written from node rather than a shell: `\xHH`
    // is not POSIX printf, so dash emits it literally and the test would assert on nothing.
    const output = await execFileBounded(
      "node",
      [
        "-e",
        "process.stdout.write(Buffer.from([0xe2, 0x9c])); setTimeout(() => process.stdout.write(Buffer.from([0x93])), 200);"
      ],
      {
        phase: SecretScanningExecPhase.Scan,
        timeoutMs: 10_000
      }
    );

    expect(output).toBe("✓");
  });

  test("rejects when the binary cannot be started", async () => {
    const error = await execFileBounded("this-binary-does-not-exist", [], {
      phase: SecretScanningExecPhase.Scan,
      timeoutMs: 10_000
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretScanningExecError);
    expect((error as SecretScanningExecError).failure).toBe(SecretScanningExecFailure.Spawn);
  });

  test("kills the whole process group on timeout, not just the direct child", async () => {
    // Mirrors the real shape: the scanner spawns a long-running grandchild (`git log -p`) that is
    // the process actually holding memory. Signalling only the direct child orphans it.
    const grandchildPidFile = `${process.env.TMPDIR ?? "/tmp"}/exec-bounded-grandchild-${process.pid}.pid`;

    const error = await execFileBounded("sh", ["-c", `sh -c 'echo $$ > ${grandchildPidFile}; sleep 60' & wait`], {
      phase: SecretScanningExecPhase.Scan,
      timeoutMs: 1_000
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretScanningExecError);
    expect((error as SecretScanningExecError).failure).toBe(SecretScanningExecFailure.Timeout);

    const { stdout } = await execFileAsync("cat", [grandchildPidFile]);
    const grandchildPid = Number(stdout.trim());

    expect(Number.isNaN(grandchildPid)).toBe(false);
    expect(isProcessAlive(grandchildPid)).toBe(false);

    await execFileAsync("rm", ["-f", grandchildPidFile]);
  }, 15_000);
});

describe("getScannerProcessEnv", () => {
  test("caps scanner memory and CPU by default", () => {
    expect(getScannerProcessEnv()).toEqual({ GOMEMLIMIT: "2048MiB", GOMAXPROCS: "1" });
  });

  test("omits the CPU cap when disabled with 0", () => {
    mockConfig.SECRET_SCANNING_CPU_THREADS = 0;
    try {
      expect(getScannerProcessEnv()).toEqual({ GOMEMLIMIT: "2048MiB" });
    } finally {
      mockConfig.SECRET_SCANNING_CPU_THREADS = 1;
    }
  });

  test("returns undefined when both caps are disabled", () => {
    mockConfig.SECRET_SCANNING_MEMORY_LIMIT_MB = 0;
    mockConfig.SECRET_SCANNING_CPU_THREADS = 0;
    try {
      expect(getScannerProcessEnv()).toBeUndefined();
    } finally {
      mockConfig.SECRET_SCANNING_MEMORY_LIMIT_MB = 2048;
      mockConfig.SECRET_SCANNING_CPU_THREADS = 1;
    }
  });

  test("the overrides reach the child without replacing its inherited environment", async () => {
    // Proves the env option merges over process.env rather than replacing it: PATH must survive for
    // the binary lookup to work at all, and the override must be visible to the child.
    const output = await execFileBounded("sh", ["-c", "echo $GOMAXPROCS"], {
      phase: SecretScanningExecPhase.Scan,
      timeoutMs: 10_000,
      env: getScannerProcessEnv()
    });

    expect(output.trim()).toBe("1");
  });
});

describe("getGitThreadLimitArgs", () => {
  test("caps git pack threads via -c argv", () => {
    expect(getGitThreadLimitArgs()).toEqual(["-c", "pack.threads=1"]);
  });

  test("adds nothing when the cap is disabled with 0", () => {
    mockConfig.SECRET_SCANNING_CPU_THREADS = 0;
    try {
      expect(getGitThreadLimitArgs()).toEqual([]);
    } finally {
      mockConfig.SECRET_SCANNING_CPU_THREADS = 1;
    }
  });
});
