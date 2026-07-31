import { execFile } from "child_process";
import { promisify } from "util";
import { describe, expect, test } from "vitest";

import {
  execFileBounded,
  SecretScanningExecError,
  SecretScanningExecFailure,
  SecretScanningExecPhase
} from "./secret-scanning-exec";

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
