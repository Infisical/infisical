import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { clearSandboxCommandLog, recordSandboxCommand, SandboxCommandSource } from "./sandbox-command-log";
import {
  execInContainer,
  isContainerRunning,
  prepareDockerRuntime,
  removeContainer,
  startContainer,
  writeFileInContainer
} from "./sandbox-docker";
import { TSandboxExecResult } from "./sandbox-types";

/**
 * Each sandbox is a container of its own, so a command cannot see the API host, its processes, or
 * anything else on the compose network. `sandbox-docker.ts` owns the container; this module owns the
 * shell semantics on top of it: a persistent working directory, output limits, and timeouts.
 *
 * It still drives the host's Docker daemon through a mounted socket, so it is refused outside
 * development.
 */

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 200_000;
const CWD_MARKER = "__INFISICAL_SANDBOX_CWD__";
const SANDBOX_HOME = "/home/agent";

type TSandboxProcessState = {
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
        "Sandbox command execution is disabled in production. This prototype drives the host's Docker daemon and is not hardened for multi-tenant use."
    });
  }
};

const readDockerfile = () =>
  readFile(join(__dirname, "Dockerfile.sandbox"), "utf8").catch(() => {
    throw new BadRequestError({
      message: "The sandbox image definition is missing from this build, so no sandbox can be started."
    });
  });

export const bootSandbox = async (sandboxId: string, resources: { vcpu: number; memoryMb: number }) => {
  assertSandboxRuntimeEnabled();

  const existing = states.get(sandboxId);
  if (existing) return existing;

  await prepareDockerRuntime(await readDockerfile());
  await startContainer(sandboxId, resources);

  const state: TSandboxProcessState = { cwd: SANDBOX_HOME, extraEnv: {} };
  states.set(sandboxId, state);

  logger.info(`Sandbox booted [sandboxId=${sandboxId}]`);
  return state;
};

export const shutdownSandbox = async (sandboxId: string) => {
  clearSandboxCommandLog(sandboxId);
  if (!states.has(sandboxId)) return;

  states.delete(sandboxId);
  await removeContainer(sandboxId).catch((error: Error) => {
    logger.error(error, `Failed to remove sandbox container [sandboxId=${sandboxId}]`);
  });
};

export const isSandboxBooted = (sandboxId: string) => states.has(sandboxId);

export const setSandboxEnv = (sandboxId: string, extraEnv: Record<string, string>) => {
  const state = states.get(sandboxId);
  if (state) state.extraEnv = { ...state.extraEnv, ...extraEnv };
};

export const writeSandboxFile = (sandboxId: string, relativePath: string, content: string) =>
  writeFileInContainer(sandboxId, `${SANDBOX_HOME}/${relativePath}`, content);

export const sandboxHomePath = (relativePath: string) => `${SANDBOX_HOME}/${relativePath}`;

const truncate = (value: string) => (value.length > MAX_OUTPUT_BYTES ? value.slice(0, MAX_OUTPUT_BYTES) : value);

// Single-quoted, because the cwd is interpolated into the wrapper script. JSON.stringify escapes
// quotes and backslashes but leaves `$` and backticks live inside a double-quoted word, which made a
// poisoned cwd executable on the next command.
const shellQuote = (value: string) => `'${value.split("'").join(`'\\''`)}'`;

export const execInSandbox = async (
  sandboxId: string,
  command: string,
  // Defaults to the terminal because that is the only caller a user drives directly; everything
  // else names itself, so the log can tell the agent's work from a person's.
  source: SandboxCommandSource = SandboxCommandSource.Terminal
): Promise<TSandboxExecResult> => {
  assertSandboxRuntimeEnabled();

  const state = states.get(sandboxId);
  if (!state) {
    throw new BadRequestError({ message: "Sandbox is not running. Start it before running commands." });
  }

  if (!(await isContainerRunning(sandboxId))) {
    states.delete(sandboxId);
    throw new BadRequestError({
      message: "This sandbox's container is no longer running. Start the sandbox again."
    });
  }

  const startedAt = Date.now();

  // Echoing pwd through a marker is what lets `cd` persist between commands even though each one is
  // its own exec. The marker carries a per-exec nonce because the user's command runs *before* the
  // trailing printf and would otherwise be able to emit a marker of its own and choose the next cwd.
  const marker = `${CWD_MARKER}${crypto.randomBytes(12).toString("hex")}:`;
  const script = [`cd ${shellQuote(state.cwd)} || exit 1`, command, `printf '\\n${marker}%s' "$(pwd)"`].join("\n");

  const result = await execInContainer(sandboxId, script, {
    // The container is started fresh, so the working directory always exists on the first command.
    cwd: SANDBOX_HOME,
    env: { ...state.extraEnv, INFISICAL_SANDBOX_ID: sandboxId },
    timeoutMs: COMMAND_TIMEOUT_MS
  });

  let cleanStdout = result.stdout;
  const markerAt = result.stdout.lastIndexOf(marker);
  if (markerAt !== -1) {
    const reportedCwd = result.stdout.slice(markerAt + marker.length).trim();
    // Must be home itself or a path beneath it. A bare startsWith would also accept a sibling like
    // `/home/agent-evil`.
    if (reportedCwd === SANDBOX_HOME || reportedCwd.startsWith(`${SANDBOX_HOME}/`)) {
      state.cwd = reportedCwd;
    }
    cleanStdout = result.stdout.slice(0, markerAt).replace(/\n$/, "");
  }

  // `timeout` reports 137 for a SIGKILL it sent, which is how a command that ran too long is told
  // apart from one that merely exited non-zero.
  const timedOut = result.exitCode === 137;

  recordSandboxCommand(sandboxId, {
    source,
    command,
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt
  });

  return {
    command,
    stdout: truncate(cleanStdout),
    stderr: truncate(result.stderr),
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    cwd: state.cwd === SANDBOX_HOME ? "~" : `~${state.cwd.slice(SANDBOX_HOME.length)}`,
    wasTruncated: result.stdout.length > MAX_OUTPUT_BYTES || result.stderr.length > MAX_OUTPUT_BYTES,
    timedOut
  };
};
