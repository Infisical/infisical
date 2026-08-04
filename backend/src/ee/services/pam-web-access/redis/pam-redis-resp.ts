/* eslint-disable max-classes-per-file */
import net from "node:net";

const CRLF_LEN = 2;
const MAX_LINE_BYTES = 64 * 1024;
const MAX_DEPTH = 32;
const CLOSE_FLUSH_MS = 1_000;
const PING_BUDGET_BYTES = 1024;
const READ_HIGH_WATER = 1024 * 1024;
const READ_LOW_WATER = 256 * 1024;

export class RespCommandError extends Error {}

export class RespProtocolError extends Error {}

export type TRespReply = string | number | null | RespCommandError | TRespReply[];

type TBudget = {
  remaining: () => number;
  spend: (bytes: number) => void;
  exhausted: () => boolean;
  markTruncated: () => void;
  wasTruncated: () => boolean;
};

const createBudget = (total: number): TBudget => {
  let left = total;
  let truncated = false;
  return {
    remaining: () => (left > 0 ? left : 0),
    spend: (bytes) => {
      left -= bytes;
    },
    exhausted: () => left <= 0,
    markTruncated: () => {
      truncated = true;
    },
    wasTruncated: () => truncated
  };
};

class ByteReader {
  private queue: Buffer[] = [];

  private size = 0;

  private waiters: (() => void)[] = [];

  private ended: Error | null = null;

  private paused = false;

  constructor(private readonly socket: net.Socket) {
    socket.on("data", (chunk: Buffer) => {
      this.queue.push(chunk);
      this.size += chunk.length;
      if (!this.paused && this.size > READ_HIGH_WATER) {
        this.paused = true;
        socket.pause();
      }
      this.wake();
    });
    socket.on("error", (err) => this.end(err));
    socket.on("close", () => this.end(new RespProtocolError("Redis connection closed")));
  }

  private wake() {
    const pending = this.waiters;
    this.waiters = [];
    pending.forEach((resolve) => resolve());
  }

  private end(err: Error) {
    if (!this.ended) this.ended = err;
    this.wake();
  }

  private async waitForMoreThan(seen: number): Promise<void> {
    while (this.size <= seen) {
      if (this.ended) throw this.ended;
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  private drained() {
    if (this.paused && this.size <= READ_LOW_WATER) {
      this.paused = false;
      this.socket.resume();
    }
  }

  private async pull(bytes: number, keep: boolean): Promise<Buffer> {
    const parts: Buffer[] = [];
    let need = bytes;

    while (need > 0) {
      // eslint-disable-next-line no-await-in-loop
      await this.waitForMoreThan(0);
      const head = this.queue[0];

      if (head.length <= need) {
        this.queue.shift();
        this.size -= head.length;
        need -= head.length;
        if (keep) parts.push(head);
      } else {
        if (keep) parts.push(head.subarray(0, need));
        this.queue[0] = head.subarray(need);
        this.size -= need;
        need = 0;
      }

      this.drained();
    }

    return keep ? Buffer.concat(parts) : Buffer.alloc(0);
  }

  private indexOfCRLF(): number {
    let base = 0;
    let previousWasCR = false;

    for (const chunk of this.queue) {
      if (chunk.length > 0) {
        if (previousWasCR && chunk[0] === 0x0a) return base - 1;
        const idx = chunk.indexOf("\r\n");
        if (idx >= 0) return base + idx;
        previousWasCR = chunk[chunk.length - 1] === 0x0d;
        base += chunk.length;
      }
    }

    return -1;
  }

  read(bytes: number): Promise<Buffer> {
    return this.pull(bytes, true);
  }

  async skip(bytes: number): Promise<void> {
    await this.pull(bytes, false);
  }

  async line(): Promise<string> {
    for (;;) {
      const idx = this.indexOfCRLF();
      if (idx >= 0) {
        // eslint-disable-next-line no-await-in-loop
        const buf = await this.read(idx + CRLF_LEN);
        return buf.subarray(0, idx).toString("utf8");
      }
      if (this.size > MAX_LINE_BYTES) {
        throw new RespProtocolError("Redis reply header exceeded the maximum length");
      }
      const seen = this.size;
      // eslint-disable-next-line no-await-in-loop
      await this.waitForMoreThan(seen);
    }
  }
}

const parseLength = (body: string, what: string): number => {
  const value = Number.parseInt(body, 10);
  if (Number.isNaN(value)) throw new RespProtocolError(`Redis sent an unreadable ${what} length`);
  return value;
};

// discards a whole reply so the stream stays aligned
const skipReply = async (reader: ByteReader, depth: number): Promise<void> => {
  if (depth > MAX_DEPTH) throw new RespProtocolError("Redis reply nested too deeply");
  const line = await reader.line();
  const body = line.slice(1);

  switch (line[0]) {
    case "+":
    case "-":
    case ":":
      return;
    case "$": {
      const len = parseLength(body, "bulk");
      if (len >= 0) await reader.skip(len + CRLF_LEN);
      return;
    }
    case "*": {
      const count = parseLength(body, "array");
      for (let i = 0; i < count; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await skipReply(reader, depth + 1);
      }
      return;
    }
    default:
      throw new RespProtocolError(`Redis sent an unexpected reply type '${line[0] ?? ""}'`);
  }
};

const readReply = async (reader: ByteReader, budget: TBudget, depth: number): Promise<TRespReply> => {
  if (depth > MAX_DEPTH) throw new RespProtocolError("Redis reply nested too deeply");

  const line = await reader.line();
  if (line.length === 0) throw new RespProtocolError("Redis sent an empty reply line");

  // headers are charged too, so huge arrays of tiny elements stay bounded
  budget.spend(line.length + CRLF_LEN);
  const body = line.slice(1);

  switch (line[0]) {
    case "+":
      return body;
    case "-":
      // inside an array an error is a value, so the elements after it are still read
      if (depth > 0) return new RespCommandError(body);
      throw new RespCommandError(body);
    case ":":
      return Number(body);
    case "$": {
      const len = parseLength(body, "bulk");
      if (len < 0) return null;
      const keep = Math.min(len, budget.remaining());
      const value = await reader.read(keep);
      await reader.skip(len - keep + CRLF_LEN);
      budget.spend(keep);
      if (keep < len) budget.markTruncated();
      return value.toString("utf8");
    }
    case "*": {
      const count = parseLength(body, "array");
      if (count < 0) return null;
      const items: TRespReply[] = [];
      for (let i = 0; i < count; i += 1) {
        if (budget.exhausted()) {
          budget.markTruncated();
          // eslint-disable-next-line no-await-in-loop
          await skipReply(reader, depth + 1);
        } else {
          // eslint-disable-next-line no-await-in-loop
          items.push(await readReply(reader, budget, depth + 1));
        }
      }
      return items;
    }
    default:
      throw new RespProtocolError(`Redis sent an unexpected reply type '${line[0]}'`);
  }
};

const encodeCommand = (name: string, args: string[]): Buffer => {
  const parts = [name, ...args];
  const chunks = [Buffer.from(`*${parts.length}\r\n`)];

  parts.forEach((part) => {
    const value = Buffer.from(part, "utf8");
    chunks.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n"));
  });

  return Buffer.concat(chunks);
};

const withDeadline = async <T>(work: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export type TRespCommandResult = { reply: TRespReply; truncated: boolean };

export type TRespClient = {
  command: (
    name: string,
    args: string[],
    opts: { deadlineMs: number; budgetBytes: number }
  ) => Promise<TRespCommandResult>;
  onClose: (listener: (err: Error) => void) => void;
  close: () => void;
};

export const connectRespClient = async ({
  host = "localhost",
  port,
  connectTimeoutMs
}: {
  host?: string;
  port: number;
  connectTimeoutMs: number;
}): Promise<TRespClient> => {
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const pending = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      pending.destroy();
      reject(new Error(`Redis connection timed out after ${connectTimeoutMs / 1000}s`));
    }, connectTimeoutMs);

    pending.once("connect", () => {
      clearTimeout(timer);
      pending.setNoDelay(true);
      resolve(pending);
    });
    pending.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const reader = new ByteReader(socket);
  const closeListeners: ((err: Error) => void)[] = [];
  let broken: Error | null = null;
  let inFlight = false;

  const fail = (err: Error) => {
    if (!broken) broken = err;
    socket.destroy();
  };

  // "error" is followed by "close", so the session must not be ended twice
  let announced = false;
  const announceClose = (err: Error) => {
    if (announced) return;
    announced = true;
    closeListeners.forEach((listener) => listener(err));
  };

  socket.on("error", (err) => announceClose(err));
  socket.on("close", () => announceClose(broken ?? new RespProtocolError("Redis connection closed")));

  const command = async (
    name: string,
    args: string[],
    { deadlineMs, budgetBytes }: { deadlineMs: number; budgetBytes: number }
  ): Promise<TRespCommandResult> => {
    if (broken) throw broken;
    if (inFlight) throw new RespProtocolError("A Redis command is already running on this session");

    inFlight = true;
    const budget = createBudget(budgetBytes);

    try {
      socket.write(encodeCommand(name, args));
      const reply = await withDeadline(
        readReply(reader, budget, 0),
        deadlineMs,
        `Command timed out after ${deadlineMs / 1000}s`
      );
      return { reply, truncated: budget.wasTruncated() };
    } catch (err) {
      // the stream is left mid-reply, so this connection cannot be reused
      if (!(err instanceof RespCommandError)) fail(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      inFlight = false;
    }
  };

  await command("PING", [], { deadlineMs: connectTimeoutMs, budgetBytes: PING_BUDGET_BYTES });

  return {
    command,
    onClose: (listener) => closeListeners.push(listener),
    close: () => {
      if (socket.destroyed) return;
      // flush QUIT without leaving the socket half open on its relay tunnel
      socket.end(encodeCommand("QUIT", []));
      setTimeout(() => socket.destroy(), CLOSE_FLUSH_MS).unref();
    }
  };
};
