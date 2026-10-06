import net from "node:net";

import { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

import { createReplyBudget } from "./pam-redis-reply-budget";

// answer once per command rather than once per chunk, the way a real server does
const takeCommands = (buf: Buffer): { names: string[]; rest: Buffer } => {
  const names: string[] = [];
  let offset = 0;

  for (;;) {
    const headerEnd = buf.indexOf("\r\n", offset);
    if (headerEnd < 0 || buf[offset] !== 0x2a) break;

    const argc = Number.parseInt(buf.subarray(offset + 1, headerEnd).toString(), 10);
    let cursor = headerEnd + 2;
    let name = "";
    let complete = true;

    for (let i = 0; i < argc; i += 1) {
      const lenEnd = buf.indexOf("\r\n", cursor);
      if (lenEnd < 0) {
        complete = false;
        break;
      }
      const len = Number.parseInt(buf.subarray(cursor + 1, lenEnd).toString(), 10);
      if (lenEnd + 2 + len + 2 > buf.length) {
        complete = false;
        break;
      }
      if (i === 0)
        name = buf
          .subarray(lenEnd + 2, lenEnd + 2 + len)
          .toString()
          .toLowerCase();
      cursor = lenEnd + 2 + len + 2;
    }

    if (!complete) break;
    names.push(name);
    offset = cursor;
  }

  return { names, rest: buf.subarray(offset) };
};

const INFO_BODY = "# Server\r\nloading:0\r\n";

const startFakeRedis = async (replyBytes: () => number) => {
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const { names, rest } = takeCommands(pending);
      pending = rest;

      names.forEach((name) => {
        if (name === "info") {
          socket.write(`$${INFO_BODY.length}\r\n${INFO_BODY}\r\n`);
          return;
        }
        if (name === "client") {
          socket.write("+OK\r\n");
          return;
        }
        const size = replyBytes();
        socket.write(`$${size}\r\n${"x".repeat(size)}\r\n`);
      });
    });
    socket.on("error", () => {});
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return {
    port: (server.address() as net.AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  };
};

let live: { client?: Redis; server?: { close: () => Promise<void> } } = {};

const connect = async (maxBytes: number, replyBytes: () => number) => {
  const server = await startFakeRedis(replyBytes);
  const budget = createReplyBudget(maxBytes);
  const client = new Redis({
    host: "127.0.0.1",
    port: server.port,
    maxRetriesPerRequest: 0,
    reconnectOnError: () => false,
    retryStrategy: () => null
  });
  client.on("error", () => {});
  budget.attach(client);

  await new Promise<void>((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
  });

  live = { client, server };
  return { client, budget };
};

afterEach(async () => {
  live.client?.disconnect();
  await live.server?.close();
  live = {};
});

describe("createReplyBudget", () => {
  it("lets a reply inside the budget through", async () => {
    const { client, budget } = await connect(64 * 1024, () => 1024);
    budget.arm();
    expect(((await client.call("get", "k")) as string).length).toBe(1024);
    expect(budget.exceeded()).toBe(false);
  });

  it("drops the connection when one reply passes the budget", async () => {
    const { client, budget } = await connect(16 * 1024, () => 512 * 1024);
    budget.arm();
    await expect(client.call("get", "big")).rejects.toThrow();
    expect(budget.exceeded()).toBe(true);
  });

  it("stays exceeded after arming again, so the session end can report the reason", async () => {
    const { client, budget } = await connect(16 * 1024, () => 512 * 1024);
    budget.arm();
    await expect(client.call("get", "big")).rejects.toThrow();
    budget.arm();
    expect(budget.exceeded()).toBe(true);
  });

  it("applies per reply, so many replies never add up to a trip", async () => {
    const { client, budget } = await connect(8 * 1024, () => 4 * 1024);

    for (let i = 0; i < 20; i += 1) {
      budget.arm();
      // eslint-disable-next-line no-await-in-loop
      expect(((await client.call("get", `k${i}`)) as string).length).toBe(4 * 1024);
    }

    expect(budget.exceeded()).toBe(false);
  });

  it("does not let the handshake eat the first command's budget", async () => {
    const { client, budget } = await connect(8 * 1024, () => 6 * 1024);
    budget.arm();
    expect(((await client.call("get", "k")) as string).length).toBe(6 * 1024);
    expect(budget.exceeded()).toBe(false);
  });

  it("gives each session its own counter", async () => {
    const { client, budget: first } = await connect(16 * 1024, () => 512 * 1024);
    first.arm();
    await expect(client.call("get", "big")).rejects.toThrow();

    expect(first.exceeded()).toBe(true);
    expect(createReplyBudget(16 * 1024).exceeded()).toBe(false);
  });
});
