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

/**
 * Which sandboxes have a workload running. Held here rather than on the row because it is runtime
 * state like the container itself: it cannot outlive the container, and a stopped sandbox has none.
 * Without it the UI could only guess, and a page refresh would offer to start a second one.
 */
const workloads = new Set<string>();

export const isWorkloadRunning = (sandboxId: string) => workloads.has(sandboxId);

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

export const bootSandbox = async (
  sandboxId: string,
  resources: { vcpu: number; memoryMb: number },
  onLog: (line: string) => void = () => {}
) => {
  assertSandboxRuntimeEnabled();

  const existing = states.get(sandboxId);
  if (existing) return existing;

  await prepareDockerRuntime(await readDockerfile(), onLog);
  await startContainer(sandboxId, resources, onLog);

  const state: TSandboxProcessState = { cwd: SANDBOX_HOME, extraEnv: {} };
  states.set(sandboxId, state);

  logger.info(`Sandbox booted [sandboxId=${sandboxId}]`);
  return state;
};

export const shutdownSandbox = async (sandboxId: string) => {
  clearSandboxCommandLog(sandboxId);
  if (!states.has(sandboxId)) return;

  states.delete(sandboxId);
  workloads.delete(sandboxId);
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

/**
 * A real background workload for demos, not a synthetic chart.
 *
 * The CPU line is flat when a sandbox is idle, which is honest but shows nothing. This starts an
 * actual process inside the container that burns and sleeps in varying bursts, so the chart moves
 * because the container is genuinely busy. Marked and killed by that marker, so it can be stopped
 * again and cannot outlive the sandbox.
 */
const WORKLOAD_MARKER = "INFISICAL_SANDBOX_DEMO_WORKLOAD";

export const setDemoWorkload = async (sandboxId: string, isEnabled: boolean) => {
  const state = states.get(sandboxId);
  if (!state) {
    throw new BadRequestError({ message: "Sandbox is not running. Start it before running a workload." });
  }

  if (!isEnabled) {
    await execInContainer(sandboxId, `pkill -f ${WORKLOAD_MARKER} || true`, {
      cwd: SANDBOX_HOME,
      env: {},
      timeoutMs: 10_000
    });
    workloads.delete(sandboxId);
    return;
  }

  // setsid + nohup so it is not torn down when this exec returns. Bursts vary in both length and
  // spacing, which is what gives the trace peaks and troughs rather than a plateau.
  //
  // Each round also holds a blob of a varying size and then drops it, so resident memory rises and
  // falls with the load instead of sitting flat while only CPU moves. Sized well under the smallest
  // container so the workload can never be what gets the sandbox OOM-killed.
  const script = [
    `pkill -f ${WORKLOAD_MARKER} || true`,
    `setsid nohup bash -c '# ${WORKLOAD_MARKER}`,
    "while true; do",
    "  n=$(( (RANDOM % 1200000) + 200000 ))",
    "  for ((i=0;i<n;i++)); do :; done",
    "  mb=$(( (RANDOM % 90) + 20 ))",
    "  blob=$(head -c $(( mb * 1048576 )) /dev/zero | tr \"\\0\" \"x\")",
    "  sleep 0.$(( RANDOM % 6 + 1 ))",
    "  unset blob",
    "  sleep 0.$(( RANDOM % 4 + 1 ))",
    "done' >/dev/null 2>&1 &",
    "disown || true"
  ].join("\n");

  await execInContainer(sandboxId, script, { cwd: SANDBOX_HOME, env: {}, timeoutMs: 10_000 });
  workloads.add(sandboxId);
};

export type TSandboxDirEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  /** Bytes, and null for directories where the number would be meaningless. */
  size: number | null;
};

/** Only ever below the sandbox's own home, so browsing cannot wander into the image's system dirs. */
const withinHome = (path: string) =>
  path === SANDBOX_HOME || path.startsWith(`${SANDBOX_HOME}/`) ? path : SANDBOX_HOME;

/**
 * Reads a directory straight from the container rather than through `execInSandbox`, so opening a
 * folder is not recorded as something the sandbox did. The audit log is for the sandbox's own work,
 * and filling it with the file browser's listings would bury that.
 */
export const listSandboxDirectory = async (
  sandboxId: string,
  requestedPath: string
): Promise<{ path: string; entries: TSandboxDirEntry[] }> => {
  assertSandboxRuntimeEnabled();

  if (!states.has(sandboxId)) {
    throw new BadRequestError({ message: "Sandbox is not running. Start it to browse its files." });
  }

  const path = withinHome(requestedPath || SANDBOX_HOME);

  // A tab separated record per entry: name, type, size. Parsing `ls -l` would be worse, and this
  // survives spaces in names, which `ls` output does not.
  const script = `cd ${shellQuote(path)} 2>/dev/null || exit 3
for f in * .*; do
  [ "$f" = "." ] && continue
  [ "$f" = ".." ] && continue
  [ -e "$f" ] || continue
  if [ -d "$f" ]; then printf 'd\t%s\t0\n' "$f"; else printf 'f\t%s\t%s\n' "$f" "$(wc -c < "$f" 2>/dev/null || echo 0)"; fi
done`;

  const result = await execInContainer(sandboxId, script, {
    cwd: path,
    env: {},
    timeoutMs: 10_000
  });

  if (result.exitCode === 3) {
    throw new BadRequestError({ message: `'${path}' is not a directory in this sandbox.` });
  }

  const entries = result.stdout
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length === 3 && parts[1])
    .map(([type, name, size]) => ({
      name,
      path: `${path === "/" ? "" : path}/${name}`,
      isDirectory: type === "d",
      size: type === "d" ? null : Number(size) || 0
    }))
    // Directories first, then alphabetical, which is what a file browser is expected to do.
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return { path, entries };
};

const MAX_FILE_PREVIEW_BYTES = 100_000;

/** Reads one file for preview. Capped, because the browser has to render whatever comes back. */
export const readSandboxFile = async (sandboxId: string, requestedPath: string) => {
  assertSandboxRuntimeEnabled();

  if (!states.has(sandboxId)) {
    throw new BadRequestError({ message: "Sandbox is not running. Start it to read its files." });
  }

  const path = withinHome(requestedPath);
  const script = `[ -f ${shellQuote(path)} ] || exit 3
head -c ${MAX_FILE_PREVIEW_BYTES} ${shellQuote(path)}`;

  const result = await execInContainer(sandboxId, script, {
    cwd: SANDBOX_HOME,
    env: {},
    timeoutMs: 10_000
  });

  if (result.exitCode === 3) {
    throw new BadRequestError({ message: `'${path}' is not a readable file in this sandbox.` });
  }

  return {
    path,
    content: result.stdout,
    wasTruncated: result.stdout.length >= MAX_FILE_PREVIEW_BYTES
  };
};
