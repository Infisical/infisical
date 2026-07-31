import { spawn } from "child_process";
import RE2 from "re2";
import { StringDecoder } from "string_decoder";

import { getConfig } from "@app/lib/config/env";

export enum SecretScanningExecFailure {
  Timeout = "timeout",
  ExitCode = "exit-code",
  Spawn = "spawn"
}

/**
 * What the child process was doing, so a failure can be described to the customer accurately. The
 * binary name is not enough: `git clone` and `git count-objects` are both git but mean very
 * different things to whoever reads the scan's status message.
 */
export enum SecretScanningExecPhase {
  Clone = "clone",
  Measure = "measure",
  Scan = "scan"
}

const MAX_RETAINED_OUTPUT_CHARS = 4_000;

// Clone URLs carry the credential inline (`https://x-access-token:<token>@github.com/...`). Current
// git strips the userinfo before printing a URL back, but that is git's choice, not a guarantee we
// hold — the token is redacted here, at the point of capture, so nothing downstream has to be
// careful about logging `output`.
const UrlCredentialsRegex = new RE2(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi);

const redactUrlCredentials = (value: string) => value.replace(UrlCredentialsRegex, "$1[REDACTED]@");

type TSecretScanningExecErrorParams = {
  failure: SecretScanningExecFailure;
  phase: SecretScanningExecPhase;
  command: string;
  output: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  timeoutMs?: number;
  cause?: Error;
};

/**
 * Raised for any non-success termination of a scanner/git child process. `message` is kept free of
 * command lines and process output so it is safe to log; `output` holds the captured stdout/stderr
 * and must never be forwarded to a customer-facing status message.
 */
export class SecretScanningExecError extends Error {
  readonly failure: SecretScanningExecFailure;

  readonly phase: SecretScanningExecPhase;

  readonly command: string;

  readonly output: string;

  readonly exitCode?: number | null;

  readonly signal?: NodeJS.Signals | null;

  readonly timeoutMs?: number;

  constructor({ failure, phase, command, output, exitCode, signal, timeoutMs, cause }: TSecretScanningExecErrorParams) {
    let message: string;
    switch (failure) {
      case SecretScanningExecFailure.Timeout:
        message = `"${command}" exceeded its ${timeoutMs}ms time limit and was terminated`;
        break;
      case SecretScanningExecFailure.Spawn:
        message = `"${command}" could not be started: ${cause?.message ?? "unknown error"}`;
        break;
      default:
        message = `"${command}" exited with code ${exitCode ?? "null"}${signal ? ` (signal ${signal})` : ""}`;
    }

    super(message);

    this.name = "SecretScanningExecError";
    this.failure = failure;
    this.phase = phase;
    this.command = command;
    // Only the tail is retained — it carries the actual failure reason and keeps log lines bounded.
    const retainedOutput =
      output.length > MAX_RETAINED_OUTPUT_CHARS ? output.slice(-MAX_RETAINED_OUTPUT_CHARS) : output;
    this.output = redactUrlCredentials(retainedOutput);
    this.exitCode = exitCode;
    this.signal = signal;
    this.timeoutMs = timeoutMs;
  }
}

// Matches Node's default execFile maxBuffer. Findings are written to a file via `-r`, so this only
// ever holds progress output — but it is captured explicitly so a chatty child can't grow the heap.
const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;

/**
 * `infisical scan` shells out to `git log -p -U0 --full-history --all`, and that grandchild is the
 * process actually holding the memory. Signalling only the direct child orphans it, so the child is
 * spawned `detached` (its own process group) and the whole group is signalled by negative pid.
 */
const killProcessGroup = (pid: number | undefined) => {
  if (!pid) return;

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group is already gone (normal exit raced the timer) or we never became a group leader;
    // fall back to the direct child so we at least don't leave it running.
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // nothing left to kill
    }
  }
};

type TExecFileBoundedOptions = {
  phase: SecretScanningExecPhase;
  cwd?: string;
  timeoutMs: number;
  env?: Record<string, string>;
  /** Exit codes treated as success. The scanner uses 77 to signal "findings were written". */
  successExitCodes?: number[];
};

export const execFileBounded = (
  file: string,
  args: string[],
  { phase, cwd, timeoutMs, env, successExitCodes = [0] }: TExecFileBoundedOptions
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      detached: true,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    let capturedBytes = 0;
    // One decoder per stream: a multi-byte character split across two reads would otherwise be
    // decoded as two replacement characters.
    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    const capture = (stream: keyof typeof decoders) => (chunk: Buffer) => {
      if (capturedBytes >= MAX_CAPTURED_OUTPUT_BYTES) return;
      capturedBytes += chunk.length;
      output += decoders[stream].write(chunk);
    };

    child.stdout.on("data", capture("stdout"));
    child.stderr.on("data", capture("stderr"));

    // Killing the process group can tear a pipe down mid-read. An `error` with no listener is an
    // uncaught exception, which would take the worker down over a child we were killing anyway, so
    // it is recorded and folded into the captured output; the exit path reports the failure.
    let stdioError: Error | undefined;
    const rememberStdioError = (err: Error) => {
      stdioError = err;
    };
    child.stdout.on("error", rememberStdioError);
    child.stderr.on("error", rememberStdioError);

    // Flush whatever each decoder is still holding, so a trailing partial character isn't dropped.
    // `error` and `close` can both fire, so this only takes effect once.
    let finalized = false;
    const finalizeOutput = () => {
      if (finalized) return;
      finalized = true;
      output += decoders.stdout.end();
      output += decoders.stderr.end();
      if (stdioError) output += `\n[stdio error] ${stdioError.message}`;
    };

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      finalizeOutput();
      reject(
        new SecretScanningExecError({
          failure: SecretScanningExecFailure.Spawn,
          phase,
          command: file,
          output,
          cause: err
        })
      );
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      finalizeOutput();

      if (timedOut) {
        reject(
          new SecretScanningExecError({
            failure: SecretScanningExecFailure.Timeout,
            phase,
            command: file,
            output,
            timeoutMs
          })
        );
        return;
      }

      if (exitCode !== null && successExitCodes.includes(exitCode)) {
        resolve(output);
        return;
      }

      reject(
        new SecretScanningExecError({
          failure: SecretScanningExecFailure.ExitCode,
          phase,
          command: file,
          output,
          exitCode,
          signal
        })
      );
    });
  });

/**
 * Without this git blocks on an interactive credential prompt when the embedded credentials are
 * rejected, turning an auth failure into a wait for the clone timeout.
 */
export const GIT_PROCESS_ENV = { GIT_TERMINAL_PROMPT: "0" };

/**
 * Environment overrides for the Go-based scanner CLI. GOMEMLIMIT is a soft ceiling: as the scanner
 * approaches it the Go runtime collects more aggressively instead of growing, so a repository
 * slightly over budget still completes rather than being killed. Runtimes older than Go 1.19 simply
 * ignore it. RLIMIT_AS (`ulimit -v`) is deliberately not used — Go reserves large virtual address
 * arenas at startup, so hard virtual-memory limits break Go binaries in confusing ways.
 */
export const getScannerProcessEnv = (): Record<string, string> | undefined => {
  const { SECRET_SCANNING_MEMORY_LIMIT_MB } = getConfig();

  if (!SECRET_SCANNING_MEMORY_LIMIT_MB) return undefined;

  return { GOMEMLIMIT: `${SECRET_SCANNING_MEMORY_LIMIT_MB}MiB` };
};
