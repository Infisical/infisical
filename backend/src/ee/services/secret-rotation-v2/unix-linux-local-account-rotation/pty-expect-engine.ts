import { StringDecoder } from "node:string_decoder";

export const SHELL_TIMEOUT = 15_000;
export const MAX_BUFFER_SIZE = 64 * 1024;
const MAX_TRANSCRIPT_SIZE = 4 * 1024;

export type TInteractiveShellStream = {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  write(data: string): void;
  end(): void;
};

const createTranscript = (secrets: (string | undefined)[]) => {
  const knownSecrets = secrets.filter((secret): secret is string => Boolean(secret));
  const redact = (value: string) =>
    knownSecrets.reduce((redacted, secret) => redacted.replaceAll(secret, "***"), value);

  let text = "";
  let truncated = false;

  return {
    append: (chunk: string) => {
      text += chunk;
      if (text.length > MAX_TRANSCRIPT_SIZE) {
        text = text.slice(-MAX_TRANSCRIPT_SIZE);
        truncated = true;
      }
    },
    redact,
    read: () => (truncated ? `...${redact(text)}` : redact(text))
  };
};

export const escapeForPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const lineAt = (text: string, index: number) => {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return (end === -1 ? text.slice(start) : text.slice(start, end)).trim();
};

export type TExpectAdvanceContext = {
  readonly pending: string;
  consume: (match: RegExpExecArray) => void;
  clearPending: () => void;
  write: (data: string) => void;
  finish: () => void;
  safeReject: (error: Error) => void;
  transcript: {
    redact: (value: string) => string;
    read: () => string;
  };
};

export type TExpectCloseContext = {
  transcript: {
    read: () => string;
  };
};

export type TExpectCloseDecision = { resolve: true } | { resolve: false; error: Error };

export type TExpectSessionConfig = {
  stream: TInteractiveShellStream;
  secrets: (string | undefined)[];
  advance: (ctx: TExpectAdvanceContext) => boolean;
  resolveOnClose: (ctx: TExpectCloseContext) => TExpectCloseDecision;
  overflowMessage: (transcriptRead: string) => string;
  timeoutMessage: (transcriptRead: string) => string;
  timeoutMs?: number;
  maxBufferSize?: number;
};

/**
 * Drives an interactive PTY stream through a caller-defined state machine.
 *
 * The engine handles the low-level plumbing that every PTY-driven exchange needs:
 *   - Accumulating chunks through a StringDecoder (so multi-byte characters split across
 *     reads are reassembled, not replaced with U+FFFD).
 *   - Matching against everything received so far, not just the arriving chunk, so a prompt
 *     split across any number of data events is still recognised.
 *   - Re-running the state machine in a loop until nothing more matches, so a host that
 *     coalesces several prompts into one chunk gets all of them answered.
 *   - Bounding the pending buffer (MAX_BUFFER_SIZE) and the retained transcript
 *     (MAX_TRANSCRIPT_SIZE), with automatic secret redaction on every error path.
 *   - Timeout, settlement guards, and stream cleanup.
 *
 * Callers provide:
 *   - `advance`: the state machine. Called repeatedly until it returns false (no progress).
 *     Reads `ctx.pending`, calls `ctx.consume`, `ctx.clearPending`, `ctx.write`,
 *     `ctx.finish`, or `ctx.safeReject` as needed.
 *   - `resolveOnClose`: called once on stream close to decide resolve vs. reject.
 *   - `overflowMessage` or `timeoutMessage`: build the error string for each failure mode.
 */
export const runExpectSession = ({
  stream,
  secrets,
  advance,
  resolveOnClose,
  overflowMessage,
  timeoutMessage,
  timeoutMs = SHELL_TIMEOUT,
  maxBufferSize = MAX_BUFFER_SIZE
}: TExpectSessionConfig): Promise<void> => {
  return new Promise((resolve, reject) => {
    const transcript = createTranscript(secrets);
    const decoder = new StringDecoder("utf8");

    let pending = "";
    let settled = false;
    let closing = false;

    // eslint-disable-next-line prefer-const
    let timeout: ReturnType<typeof setTimeout>;

    const safeReject = (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        stream.end();
        reject(error);
      }
    };

    const finish = () => {
      closing = true;
      clearTimeout(timeout);
      stream.end();
    };

    timeout = setTimeout(() => {
      safeReject(new Error(timeoutMessage(transcript.read())));
    }, timeoutMs);

    const ctx: TExpectAdvanceContext = {
      get pending() {
        return pending;
      },
      consume: (match: RegExpExecArray) => {
        pending = pending.slice(match.index + match[0].length);
      },
      clearPending: () => {
        pending = "";
      },
      write: (data: string) => stream.write(data),
      finish,
      safeReject,
      transcript
    };

    stream.on("data", (chunk: Buffer) => {
      if (settled || closing) return;

      const text = decoder.write(chunk);
      if (!text) return;

      transcript.append(text);
      pending += text;

      let progressed = true;
      while (progressed && !settled && !closing) {
        progressed = advance(ctx);
      }

      if (!settled && !closing && pending.length > maxBufferSize) {
        safeReject(new Error(overflowMessage(transcript.read())));
      }
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      const tail = decoder.end();
      if (tail) transcript.append(tail);
      if (settled) return;
      settled = true;

      const decision = resolveOnClose({ transcript });
      if (decision.resolve) {
        resolve();
      } else {
        reject(decision.error);
      }
    });

    stream.on("error", (streamErr: Error) => {
      safeReject(new Error(`Stream error: ${streamErr.message}`));
    });
  });
};
