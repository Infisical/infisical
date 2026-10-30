import { PassThrough, Readable } from "node:stream";

import { describe, expect, test, vi } from "vitest";

import { AgentVaultHttpMethod, AgentVaultMcpTransport } from "../agent-vault/agent-vault-enums";
import { listMcpServerTools, MCP_TOOL_LIST_MAX_TOOLS, TMcpHttpClient } from "./agent-vault-mcp-tool-list-fns";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SERVER_URL = "https://mcp.example.com/mcp";
const AUTH = { Authorization: "Bearer secret-token" };
const SECRETS = ["secret-token"];

type TRequest = Parameters<TMcpHttpClient["request"]>[0];
type TMessage = { id?: number; method?: string; params?: { cursor?: string } };

const json = (status: number, body: unknown, sessionId: string | null = null) => ({
  status,
  contentType: "application/json",
  sessionId,
  body: Readable.from([Buffer.from(JSON.stringify(body))])
});

const sse = (messages: unknown[]) => ({
  status: 200,
  contentType: "text/event-stream",
  sessionId: null,
  body: Readable.from([
    Buffer.from(messages.map((message) => `event: message\r\ndata: ${JSON.stringify(message)}\r\n\r\n`).join(""))
  ])
});

const event = (message: unknown) => `event: message\ndata: ${JSON.stringify(message)}\n\n`;

const accepted = () => ({ status: 202, contentType: "", sessionId: null, body: Readable.from([]) });

const toolsPage = (names: string[], nextCursor?: string) => ({
  tools: names.map((name) => ({ name, description: `Does ${name}`, inputSchema: {} })),
  ...(nextCursor ? { nextCursor } : {})
});

// A streamable HTTP server whose tools/list answer is chosen per request.
const streamableServer = (answerToolsList: (message: TMessage) => ReturnType<typeof json | typeof sse>) => {
  const requests: TRequest[] = [];
  const http: TMcpHttpClient = {
    request: async (request) => {
      requests.push(request);
      if (request.method === AgentVaultHttpMethod.Delete) return accepted();
      const message = JSON.parse(request.body!) as TMessage;
      if (message.method === "initialize") {
        return json(200, { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18" } }, "session-1");
      }
      if (message.method === "notifications/initialized") return accepted();
      return answerToolsList(message);
    }
  };
  return { http, requests };
};

describe("listing an MCP server's tools", () => {
  test("streamable HTTP follows pagination, sends the session and credential, and reads JSON and SSE answers", async () => {
    const { http, requests } = streamableServer((message) =>
      message.params?.cursor
        ? sse([{ jsonrpc: "2.0", id: message.id, result: toolsPage(["write_file"]) }])
        : json(200, { jsonrpc: "2.0", id: message.id, result: toolsPage(["read_file", " bad name"], "page-2") })
    );

    const tools = await listMcpServerTools({
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      headers: AUTH,
      secrets: SECRETS,
      http
    });

    expect(tools).toEqual([
      { name: "read_file", description: "Does read_file" },
      { name: "write_file", description: "Does write_file" }
    ]);
    const listCalls = requests.filter((request) => request.body?.includes("tools/list"));
    expect(listCalls).toHaveLength(2);
    expect(listCalls[1].headers).toMatchObject({
      Authorization: "Bearer secret-token",
      "Mcp-Session-Id": "session-1",
      "MCP-Protocol-Version": "2025-06-18"
    });
  });

  test("a rejected credential says so", async () => {
    const http: TMcpHttpClient = { request: async () => json(401, {}) };
    await expect(
      listMcpServerTools({
        serverUrl: SERVER_URL,
        transport: AgentVaultMcpTransport.StreamableHttp,
        headers: AUTH,
        secrets: SECRETS,
        http
      })
    ).rejects.toThrow("'mcp.example.com' rejected the credential (HTTP 401).");
  });

  test.each(["bad token Bearer secret-token", "bad token secret-token"])(
    "a server error is reported without echoing the credential (%s)",
    async (errorMessage) => {
      const { http } = streamableServer((message) =>
        json(200, { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: errorMessage } })
      );
      const error = await listMcpServerTools({
        serverUrl: SERVER_URL,
        transport: AgentVaultMcpTransport.StreamableHttp,
        headers: AUTH,
        secrets: SECRETS,
        http
      }).catch((err: Error) => err);
      expect((error as Error).message).toContain("returned an error");
      expect((error as Error).message).not.toContain("secret-token");
    }
  );

  test("a token echoed in a description is redacted and a repeated name is listed once", async () => {
    const { http } = streamableServer((message) =>
      json(200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            { name: "read_file", description: "Uses secret-token" },
            { name: "read_file", description: "Again" }
          ]
        }
      })
    );
    const tools = await listMcpServerTools({
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      headers: AUTH,
      secrets: SECRETS,
      http
    });
    expect(tools).toEqual([{ name: "read_file", description: "Uses [redacted]" }]);
  });

  test("a server ping is answered, and its id, the pending one reused, isn't taken for the answer", async () => {
    const stream = new PassThrough();
    let listId: number | undefined;
    const { http, requests } = streamableServer((message) => {
      if (message.method === "tools/list") {
        listId = message.id;
        stream.write(event({ jsonrpc: "2.0", id: message.id, method: "ping" }));
        return { ...sse([]), body: stream };
      }
      // The ping's answer: only then does this server send the tool list.
      stream.end(event({ jsonrpc: "2.0", id: listId, result: toolsPage(["read_file"]) }));
      return accepted();
    });
    const tools = await listMcpServerTools({
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      headers: AUTH,
      secrets: SECRETS,
      http,
      budgetMs: 1000
    });
    expect(tools.map((tool) => tool.name)).toEqual(["read_file"]);
    const pong = requests.find((request) => request.body?.includes('"result"'));
    expect(JSON.parse(pong!.body!)).toEqual({ jsonrpc: "2.0", id: listId, result: {} });
    expect(pong!.headers).toMatchObject({ "Mcp-Session-Id": "session-1" });
  });

  test("a server that sends a flood of pings fails the load before any of that batch is answered", async () => {
    const pings = Array.from({ length: 21 }, (_, index) => ({ jsonrpc: "2.0", id: `ping-${index}`, method: "ping" }));
    const { http, requests } = streamableServer(() => sse([pings]));
    await expect(
      listMcpServerTools({
        serverUrl: SERVER_URL,
        transport: AgentVaultMcpTransport.StreamableHttp,
        headers: AUTH,
        secrets: SECRETS,
        http
      })
    ).rejects.toThrow("'mcp.example.com' sent too many pings while listing its tools.");
    expect(requests.some((request) => request.body?.includes('"result"'))).toBe(false);
  });

  test("a temporary server failure asks to try again and still ends the session", async () => {
    const { http, requests } = streamableServer(() => json(503, {}));
    await expect(
      listMcpServerTools({
        serverUrl: SERVER_URL,
        transport: AgentVaultMcpTransport.StreamableHttp,
        headers: AUTH,
        secrets: SECRETS,
        http
      })
    ).rejects.toThrow("couldn't answer right now (HTTP 503). Try again in a few minutes.");
    expect(requests.some((request) => request.method === AgentVaultHttpMethod.Delete)).toBe(true);
  });

  test("more tools than the cap are refused", async () => {
    const names = Array.from({ length: MCP_TOOL_LIST_MAX_TOOLS + 1 }, (_, index) => `tool_${index}`);
    const { http } = streamableServer((message) =>
      json(200, { jsonrpc: "2.0", id: message.id, result: toolsPage(names) })
    );
    await expect(
      listMcpServerTools({
        serverUrl: SERVER_URL,
        transport: AgentVaultMcpTransport.StreamableHttp,
        headers: AUTH,
        secrets: SECRETS,
        http
      })
    ).rejects.toThrow(`more than ${MCP_TOOL_LIST_MAX_TOOLS} tools`);
  });

  test("a server that never answers runs out the budget", async () => {
    const http: TMcpHttpClient = { request: () => new Promise(() => {}) };
    await expect(
      listMcpServerTools({
        serverUrl: SERVER_URL,
        transport: AgentVaultMcpTransport.StreamableHttp,
        headers: AUTH,
        secrets: SECRETS,
        http,
        budgetMs: 50
      })
    ).rejects.toThrow("didn't send its tool list within 0.05 seconds");
  });

  const sseServer = (endpoint: string, opening = `event: endpoint\ndata: ${endpoint}\n\n`) => {
    const stream = new PassThrough();
    const posts: TRequest[] = [];
    const http: TMcpHttpClient = {
      request: async (request) => {
        if (request.method === AgentVaultHttpMethod.Get) {
          stream.write(opening);
          return { status: 200, contentType: "text/event-stream", sessionId: null, body: stream };
        }
        posts.push(request);
        const message = JSON.parse(request.body!) as TMessage;
        const result = message.method === "initialize" ? { protocolVersion: "2024-11-05" } : toolsPage(["search"]);
        if (message.id !== undefined) {
          stream.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n\n`);
        }
        return accepted();
      }
    };
    return { http, posts };
  };

  test("legacy SSE posts to the announced endpoint and reads answers off the stream", async () => {
    const { http, posts } = sseServer("/messages?sessionId=abc");
    const tools = await listMcpServerTools({
      serverUrl: "https://mcp.example.com/sse",
      transport: AgentVaultMcpTransport.Sse,
      headers: AUTH,
      secrets: SECRETS,
      http
    });
    expect(tools).toEqual([{ name: "search", description: "Does search" }]);
    expect(posts.map((post) => post.url)).toEqual(
      Array(3).fill("https://mcp.example.com/messages?sessionId=abc") as string[]
    );
  });

  test("legacy SSE answers a server ping on the announced endpoint", async () => {
    const stream = new PassThrough();
    const posts: TRequest[] = [];
    let listId: number | undefined;
    const http: TMcpHttpClient = {
      request: async (request) => {
        if (request.method === AgentVaultHttpMethod.Get) {
          stream.write("event: endpoint\ndata: /messages\n\n");
          return { status: 200, contentType: "text/event-stream", sessionId: null, body: stream };
        }
        posts.push(request);
        const message = JSON.parse(request.body!) as TMessage;
        if (message.method === "initialize") {
          stream.write(event({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05" } }));
        } else if (message.method === "tools/list") {
          listId = message.id;
          stream.write(event({ jsonrpc: "2.0", id: "server-ping", method: "ping" }));
        } else if (message.method === undefined) {
          stream.write(event({ jsonrpc: "2.0", id: listId, result: toolsPage(["search"]) }));
        }
        return accepted();
      }
    };
    const tools = await listMcpServerTools({
      serverUrl: "https://mcp.example.com/sse",
      transport: AgentVaultMcpTransport.Sse,
      headers: AUTH,
      secrets: SECRETS,
      http,
      budgetMs: 1000
    });
    expect(tools).toEqual([{ name: "search", description: "Does search" }]);
    const pong = posts.find((post) => post.body?.includes("server-ping"));
    expect(pong!.url).toBe("https://mcp.example.com/messages");
    expect(JSON.parse(pong!.body!)).toEqual({ jsonrpc: "2.0", id: "server-ping", result: {} });
  });

  test("legacy SSE reads an endpoint event after a BOM and ended by bare CRs", async () => {
    const { http, posts } = sseServer("", "\uFEFFevent: endpoint\rdata: /messages\r\r");
    const tools = await listMcpServerTools({
      serverUrl: "https://mcp.example.com/sse",
      transport: AgentVaultMcpTransport.Sse,
      headers: AUTH,
      secrets: SECRETS,
      http,
      budgetMs: 1000
    });
    expect(tools).toEqual([{ name: "search", description: "Does search" }]);
    expect(posts[0].url).toBe("https://mcp.example.com/messages");
  });

  test("legacy SSE never sends the credential to an endpoint on another host", async () => {
    const { http, posts } = sseServer("https://attacker.example/messages");
    await expect(
      listMcpServerTools({
        serverUrl: "https://mcp.example.com/sse",
        transport: AgentVaultMcpTransport.Sse,
        headers: AUTH,
        secrets: SECRETS,
        http
      })
    ).rejects.toThrow("asked for messages to be sent to another host");
    expect(posts).toHaveLength(0);
  });
});
