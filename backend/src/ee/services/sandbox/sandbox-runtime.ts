import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TSandboxExecResult } from "./sandbox-types";

/**
 * Stands in for real sandbox isolation. Each sandbox is a working directory on the API host and
 * every command is a short-lived `bash` child process, which is enough to demonstrate the product
 * without a VM supervisor. A real implementation runs a Firecracker microVM (or at minimum a
 * container) per sandbox so the workload cannot see the host at all.
 *
 * Because of that, this module is a remote code execution surface by design and is refused outside
 * development. Do not lift it into production as-is.
 */

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 200_000;
const STDIO_DRAIN_MS = 150;
const CWD_MARKER = "__INFISICAL_SANDBOX_CWD__";

type TSandboxProcessState = {
  rootDir: string;
  cwd: string;
  /** Non-secret handles the sandbox is allowed to see, such as brokered PAM ports. */
  extraEnv: Record<string, string>;
};

const states = new Map<string, TSandboxProcessState>();

export const assertSandboxRuntimeEnabled = () => {
  const appCfg = getConfig();
  if (appCfg.isProductionMode) {
    throw new BadRequestError({
      message:
        "Sandbox command execution is disabled in production. This prototype runs commands on the API host and requires real VM isolation before it can be enabled."
    });
  }
};

export const bootSandbox = async (sandboxId: string) => {
  assertSandboxRuntimeEnabled();

  const existing = states.get(sandboxId);
  if (existing) return existing;

  const rootDir = await mkdtemp(join(tmpdir(), `infisical-sandbox-${sandboxId}-`));

  const state: TSandboxProcessState = { rootDir, cwd: rootDir, extraEnv: {} };
  states.set(sandboxId, state);

  logger.info(`Sandbox booted [sandboxId=${sandboxId}]`);
  return state;
};

export const shutdownSandbox = async (sandboxId: string) => {
  const state = states.get(sandboxId);
  if (!state) return;

  states.delete(sandboxId);
  await rm(state.rootDir, { recursive: true, force: true }).catch((error) => {
    logger.error(error, `Failed to clean up sandbox directory [sandboxId=${sandboxId}]`);
  });
};

export const isSandboxBooted = (sandboxId: string) => states.has(sandboxId);

export const setSandboxEnv = (sandboxId: string, extraEnv: Record<string, string>) => {
  const state = states.get(sandboxId);
  if (state) state.extraEnv = { ...state.extraEnv, ...extraEnv };
};

/**
 * The environment is allowlisted rather than inherited, so the org's credentials are not handed to
 * the command directly. This is hygiene, not a boundary: the child runs as the same OS user as the
 * API process, so anything that can read /proc can still reach them. Real isolation is the VM.
 */
const buildSandboxEnv = (sandboxId: string, rootDir: string, extraEnv: Record<string, string>) => ({
  PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  HOME: rootDir,
  TERM: "xterm-256color",
  LANG: "C.UTF-8",
  INFISICAL_SANDBOX_ID: sandboxId,
  ...extraEnv
});

const truncate = (value: string) => (value.length > MAX_OUTPUT_BYTES ? value.slice(0, MAX_OUTPUT_BYTES) : value);

// The sandbox root is a host temp path. Rewriting it to `~` keeps the host layout out of command
// output, so `pwd` reads like a real machine instead of exposing /var/folders/....
const redactRoot = (value: string, rootDir: string) => value.split(rootDir).join("~");

// Single-quoted, because the cwd is interpolated into the wrapper script. JSON.stringify escapes
// quotes and backslashes but leaves `$` and backticks live inside a double-quoted word, which made a
// poisoned cwd executable on the next command.
const shellQuote = (value: string) => `'${value.split("'").join(`'\\''`)}'`;

export const execInSandbox = async (sandboxId: string, command: string): Promise<TSandboxExecResult> => {
  assertSandboxRuntimeEnabled();

  const state = states.get(sandboxId);
  if (!state) {
    throw new BadRequestError({ message: "Sandbox is not running. Start it before running commands." });
  }

  const startedAt = Date.now();

  // Echoing pwd through a marker is what lets `cd` persist between commands even though each one is
  // its own process. The marker carries a per-exec nonce because the user's command runs *before* the
  // trailing printf and would otherwise be able to emit a marker of its own and choose the next cwd.
  const marker = `${CWD_MARKER}${crypto.randomBytes(12).toString("hex")}:`;
  const wrapped = `cd ${shellQuote(state.cwd)} || exit 1\n${command}\nprintf '\\n${marker}%s' "$(pwd)"`;

  return new Promise<TSandboxExecResult>((resolve) => {
    const child = spawn("bash", ["-lc", wrapped], {
      cwd: state.rootDir,
      env: buildSandboxEnv(sandboxId, state.rootDir, state.extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so the timeout can kill descendants rather than just bash.
      detached: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString("utf8");
    });

    let isSettled = false;

    const finish = (exitCode: number | null) => {
      if (isSettled) return;
      isSettled = true;

      clearTimeout(timer);
      killTree();

      let cleanStdout = stdout;
      const markerAt = stdout.lastIndexOf(marker);
      if (markerAt !== -1) {
        const reportedCwd = stdout.slice(markerAt + marker.length).trim();
        // Must be the root itself or a path beneath it. A bare startsWith would also accept a
        // sibling like `<rootDir>-evil`.
        if (reportedCwd === state.rootDir || reportedCwd.startsWith(`${state.rootDir}${sep}`)) {
          state.cwd = reportedCwd;
        }
        cleanStdout = stdout.slice(0, markerAt).replace(/\n$/, "");
      }

      resolve({
        command,
        stdout: truncate(redactRoot(cleanStdout, state.rootDir)),
        stderr: truncate(redactRoot(stderr, state.rootDir)),
        exitCode,
        durationMs: Date.now() - startedAt,
        cwd: state.cwd === state.rootDir ? "~" : `~${state.cwd.slice(state.rootDir.length)}`,
        wasTruncated: stdout.length > MAX_OUTPUT_BYTES || stderr.length > MAX_OUTPUT_BYTES,
        timedOut
      });
    };

    child.on("error", (error) => {
      logger.error(error, `Sandbox command failed to spawn [sandboxId=${sandboxId}]`);
      stderr += error.message;
      finish(null);
    });

    // `close` waits for every stdio pipe to shut, which a backgrounded grandchild holds open for as
    // long as it lives. Settle on `exit` instead, after a short grace period for the pipes to drain,
    // or the request hangs for the lifetime of whatever the command spawned.
    child.on("exit", (code) => {
      setTimeout(() => finish(code), STDIO_DRAIN_MS);
    });
    child.on("close", (code) => finish(code));
  });
};
