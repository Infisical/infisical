import net from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { connectRespClient, RespCommandError, RespProtocolError, TRespClient } from "./pam-redis-resp";

const PING_REPLY = "+PONG\r\n";
const OPTS = { deadlineMs: 5_000, budgetBytes: 256 * 1024 };

// one canned reply per complete command, however the request was split
const completeCommands = (buf: Buffer): { count: number; rest: Buffer } => {
  let offset = 0;
  let count = 0;

  for (;;) {
    const headerEnd = buf.indexOf("\r\n", offset);
    if (headerEnd < 0 || buf[offset] !== 0x2a) break;

    const argc = Number.parseInt(buf.subarray(offset + 1, headerEnd).toString(), 10);
    let cursor = headerEnd + 2;
    let complete = true;

    for (let i = 0; i < argc; i += 1) {
      const lenEnd = buf.indexOf("\r\n", cursor);
      if (lenEnd < 0) {
        complete = false;
        break;
      }
      const len = Number.parseInt(buf.subarray(cursor + 1, lenEnd).toString(), 10);
      cursor = lenEnd + 2 + len + 2;
      if (cursor > buf.length) {
        complete = false;
        break;
      }
    }

    if (!complete) break;
    offset = cursor;
    count += 1;
  }

  return { count, rest: buf.subarray(offset) };
};

type TFakeRedis = { port: number; close: () => Promise<void> };

const startFakeRedis = async (replies: string[], chunkSize = Infinity): Promise<TFakeRedis> => {
  const queue = [PING_REPLY, ...replies];

  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const { count, rest } = completeCommands(pending);
      pending = rest;

      for (let i = 0; i < count; i += 1) {
        const reply = Buffer.from(queue.shift() ?? "-ERR no canned reply\r\n", "binary");
        if (!Number.isFinite(chunkSize)) {
          socket.write(reply);
        } else {
          for (let at = 0; at < reply.length; at += chunkSize) {
            const slice = reply.subarray(at, at + chunkSize);
            setImmediate(() => socket.write(slice));
          }
        }
      }
    });
    socket.on("error", () => {});
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as net.AddressInfo;

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  };
};

let open: { client?: TRespClient; server?: TFakeRedis } = {};

const connect = async (replies: string[], chunkSize?: number) => {
  const server = await startFakeRedis(replies, chunkSize);
  const client = await connectRespClient({ port: server.port, connectTimeoutMs: 5_000 });
  open = { client, server };
  return client;
};

afterEach(async () => {
  open.client?.close();
  await open.server?.close();
  open = {};
});

describe("reply types", () => {
  it("reads a simple status", async () => {
    const client = await connect(["+OK\r\n"]);
    expect(await client.command("SET", ["k", "v"], OPTS)).toEqual({ reply: "OK", truncated: false });
  });

  it("reads an integer", async () => {
    const client = await connect([":42\r\n"]);
    expect((await client.command("INCR", ["k"], OPTS)).reply).toBe(42);
  });

  it("reads a negative integer", async () => {
    const client = await connect([":-1\r\n"]);
    expect((await client.command("TTL", ["k"], OPTS)).reply).toBe(-1);
  });

  it("reads a bulk string", async () => {
    const client = await connect(["$5\r\nhello\r\n"]);
    expect((await client.command("GET", ["k"], OPTS)).reply).toBe("hello");
  });

  it("reads an empty bulk string", async () => {
    const client = await connect(["$0\r\n\r\n"]);
    expect((await client.command("GET", ["k"], OPTS)).reply).toBe("");
  });

  it("reads a nil bulk as null", async () => {
    const client = await connect(["$-1\r\n"]);
    expect((await client.command("GET", ["missing"], OPTS)).reply).toBeNull();
  });

  it("reads an empty array", async () => {
    const client = await connect(["*0\r\n"]);
    expect((await client.command("KEYS", ["nope*"], OPTS)).reply).toEqual([]);
  });

  it("reads a nil array as null", async () => {
    const client = await connect(["*-1\r\n"]);
    expect((await client.command("EXEC", [], OPTS)).reply).toBeNull();
  });

  it("reads a flat array", async () => {
    const client = await connect(["*3\r\n$3\r\nfoo\r\n$3\r\nbar\r\n:7\r\n"]);
    expect((await client.command("LRANGE", ["l", "0", "-1"], OPTS)).reply).toEqual(["foo", "bar", 7]);
  });

  it("reads a nested array with a nil inside", async () => {
    const client = await connect(["*2\r\n*2\r\n$1\r\na\r\n$-1\r\n*1\r\n:9\r\n"]);
    expect((await client.command("EXEC", [], OPTS)).reply).toEqual([["a", null], [9]]);
  });

  it("surfaces a command error without breaking the session", async () => {
    const client = await connect(["-ERR unknown command 'NOPE'\r\n", "+OK\r\n"]);
    await expect(client.command("NOPE", [], OPTS)).rejects.toThrow(RespCommandError);
    expect((await client.command("SET", ["k", "v"], OPTS)).reply).toBe("OK");
  });

  it("keeps an error inside an array as a value and reads the elements after it", async () => {
    // EXEC where the second queued command failed: [OK, error, "v"]
    const client = await connect(["*3\r\n+OK\r\n-WRONGTYPE wrong kind of value\r\n$1\r\nv\r\n", "+PONG\r\n"]);

    const exec = await client.command("EXEC", [], OPTS);
    const items = exec.reply as [string, RespCommandError, string];
    expect(items[0]).toBe("OK");
    expect(items[1]).toBeInstanceOf(RespCommandError);
    expect(items[1].message).toBe("WRONGTYPE wrong kind of value");
    expect(items[2]).toBe("v");

    // the whole array was consumed, so the next command gets its own reply
    expect((await client.command("PING", [], OPTS)).reply).toBe("PONG");
  });

  it("still throws when the error is the whole reply", async () => {
    const client = await connect(["-ERR nope\r\n", "+PONG\r\n"]);
    await expect(client.command("GET", ["k"], OPTS)).rejects.toThrow(RespCommandError);
    expect((await client.command("PING", [], OPTS)).reply).toBe("PONG");
  });

  it("keeps a value that contains CRLF intact", async () => {
    const client = await connect(["$5\r\na\r\nb!\r\n"]);
    expect((await client.command("GET", ["k"], OPTS)).reply).toBe("a\r\nb!");
  });
});

describe("chunk boundaries", () => {
  const nested = "*3\r\n$5\r\nhello\r\n*2\r\n:1\r\n$3\r\nabc\r\n$-1\r\n";
  const expected = ["hello", [1, "abc"], null];

  it("reassembles a nested reply arriving one byte at a time", async () => {
    const client = await connect([nested], 1);
    expect((await client.command("EXEC", [], OPTS)).reply).toEqual(expected);
  });

  it("reassembles a nested reply arriving in two byte chunks", async () => {
    const client = await connect([nested], 2);
    expect((await client.command("EXEC", [], OPTS)).reply).toEqual(expected);
  });

  it("reassembles a nested reply arriving in three byte chunks", async () => {
    const client = await connect([nested], 3);
    expect((await client.command("EXEC", [], OPTS)).reply).toEqual(expected);
  });

  it("handles a split between CR and LF", async () => {
    const client = await connect(["$5\r\nhello\r\n"], 5);
    expect((await client.command("GET", ["k"], OPTS)).reply).toBe("hello");
  });

  it("handles a long bulk split across many chunks", async () => {
    const body = "x".repeat(10_000);
    const client = await connect([`$${body.length}\r\n${body}\r\n`], 997);
    expect((await client.command("GET", ["k"], OPTS)).reply).toBe(body);
  });

  it("reads several commands in sequence when every reply is fragmented", async () => {
    const client = await connect(["+OK\r\n", "$3\r\nabc\r\n", ":5\r\n"], 1);
    expect((await client.command("SET", ["k", "v"], OPTS)).reply).toBe("OK");
    expect((await client.command("GET", ["k"], OPTS)).reply).toBe("abc");
    expect((await client.command("STRLEN", ["k"], OPTS)).reply).toBe(5);
  });
});

describe("reply budget", () => {
  it("truncates an oversized bulk and stays in sync for the next command", async () => {
    const body = "y".repeat(64 * 1024);
    const client = await connect([`$${body.length}\r\n${body}\r\n`, "+OK\r\n"]);

    const big = await client.command("GET", ["big"], { deadlineMs: 5_000, budgetBytes: 1024 });
    expect(big.truncated).toBe(true);
    expect((big.reply as string).length).toBeLessThan(1024);
    expect((big.reply as string).startsWith("yyy")).toBe(true);

    expect((await client.command("SET", ["k", "v"], OPTS)).reply).toBe("OK");
  });

  it("drains a bulk far larger than the budget without holding it", async () => {
    const body = "z".repeat(4 * 1024 * 1024);
    const client = await connect([`$${body.length}\r\n${body}\r\n`, "+OK\r\n"], 64 * 1024);

    const big = await client.command("GET", ["huge"], { deadlineMs: 20_000, budgetBytes: 256 * 1024 });
    expect(big.truncated).toBe(true);
    expect((big.reply as string).length).toBeLessThanOrEqual(256 * 1024);

    expect((await client.command("SET", ["k", "v"], OPTS)).reply).toBe("OK");
  });

  it("truncates a long array and stays in sync", async () => {
    const items = Array.from({ length: 500 }, (_, i) => `$3\r\n${String(i).padStart(3, "0")}\r\n`).join("");
    const client = await connect([`*500\r\n${items}`, "+OK\r\n"]);

    const big = await client.command("KEYS", ["*"], { deadlineMs: 5_000, budgetBytes: 200 });
    expect(big.truncated).toBe(true);
    expect((big.reply as string[]).length).toBeLessThan(500);
    expect((big.reply as string[])[0]).toBe("000");

    expect((await client.command("SET", ["k", "v"], OPTS)).reply).toBe("OK");
  });

  it("terminates on an array of many tiny elements that spend no bulk bytes", async () => {
    const items = Array.from({ length: 20_000 }, () => ":1\r\n").join("");
    const client = await connect([`*20000\r\n${items}`, "+OK\r\n"]);

    const big = await client.command("EXEC", [], { deadlineMs: 20_000, budgetBytes: 4096 });
    expect(big.truncated).toBe(true);
    expect((big.reply as number[]).length).toBeLessThan(20_000);

    expect((await client.command("SET", ["k", "v"], OPTS)).reply).toBe("OK");
  });

  it("does not flag truncation when the reply fits", async () => {
    const client = await connect(["$5\r\nhello\r\n"]);
    expect(await client.command("GET", ["k"], OPTS)).toEqual({ reply: "hello", truncated: false });
  });
});

describe("protocol failures", () => {
  it("rejects an unknown reply type and closes the connection", async () => {
    const client = await connect(["£nonsense\r\n"]);
    await expect(client.command("GET", ["k"], OPTS)).rejects.toThrow(RespProtocolError);
    await expect(client.command("GET", ["k"], OPTS)).rejects.toThrow(RespProtocolError);
  });

  it("rejects an unreadable bulk length", async () => {
    const client = await connect(["$abc\r\n"]);
    await expect(client.command("GET", ["k"], OPTS)).rejects.toThrow(RespProtocolError);
  });

  it("reports a close to onClose listeners", async () => {
    const client = await connect(["+OK\r\n"]);
    const closed = new Promise<string>((resolve) => {
      client.onClose((err) => resolve(err.message));
    });
    client.close();
    await expect(closed).resolves.toContain("closed");
  });
});
