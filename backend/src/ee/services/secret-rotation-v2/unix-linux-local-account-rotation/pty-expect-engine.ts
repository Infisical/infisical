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
  /** Accumulated remote output not yet consumed by a successful match. */
  readonly unmatched: string;
  consume: (match: RegExpExecArray) => void;
  clearUnmatched: () => void;
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

// An SSH channel over a PTY re-segments output wherever the network splits the bytes, and a
// gateway-backed connection copies between TCP and QUIC with no framing at all. The same
// `passwd` exchange can arrive as one chunk or twenty, so matching against only the latest
// chunk is unreliable: 11 of the 49 split points inside AIX's "root's New password:\r\n"
// break a per-chunk match. This engine accumulates everything into a pending buffer and
// re-runs the caller's `advance` function in a loop, so a prompt split across any number of
// data events is still recognised and a host that coalesces several prompts into one chunk
// gets all of them answered instead of stalling.
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

    let unmatched = "";
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
      get unmatched() {
        return unmatched;
      },
      consume: (match: RegExpExecArray) => {
        unmatched = unmatched.slice(match.index + match[0].length);
      },
      clearUnmatched: () => {
        unmatched = "";
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
      unmatched += text;

      let progressed = true;
      while (progressed && !settled && !closing) {
        progressed = advance(ctx);
      }

      if (!settled && !closing && unmatched.length > maxBufferSize) {
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
