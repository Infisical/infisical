import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { PRIVATE_ADDRESS_REFUSED_MESSAGE, safeRequest } from "@app/lib/validator";

import { describeServer } from "../agent-vault-oauth/agent-vault-oauth-discovery-fns";
import { headerValue, MCP_CLIENT_INFO, MCP_PROTOCOL_VERSION } from "../agent-vault-oauth/agent-vault-oauth-http-fns";
import { normalizeProviderText } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import { AgentVaultHttpMethod, AgentVaultMcpTransport } from "../agent-vault/agent-vault-enums";
import { toolNameSchema } from "../agent-vault/agent-vault-tool-name-schemas";

const MCP_TOOL_LIST_BUDGET_MS = 20_000;
export const MCP_TOOL_LIST_MAX_TOOLS = 1000;
const MAX_PAGES = 50;
const SESSION_END_TIMEOUT_MS = 3000;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_PING_REPLIES = 20;

type TMcpHttpMethod = AgentVaultHttpMethod.Get | AgentVaultHttpMethod.Post | AgentVaultHttpMethod.Delete;

type TMcpTool = { name: string; description: string | null };

type TMcpHttpResponse = { status: number; contentType: string; sessionId: string | null; body: Readable };

// Narrow on purpose, so the client is tested against stubbed servers without a network.
export type TMcpHttpClient = {
  request: (args: {
    method: TMcpHttpMethod;
    url: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  }) => Promise<TMcpHttpResponse>;
};

// Redirects are never followed (safeRequest pins maxRedirects to 0), so a server can't bounce the credential to
// another host.
const agentVaultMcpHttpClient: TMcpHttpClient = {
  request: async ({ method, url, headers, body, signal }) => {
    const response = await safeRequest.request<Readable>({
      method,
      url,
      data: body,
      headers,
      signal,
      "axios-retry": { retries: 0 },
      responseType: "stream",
      validateStatus: () => true
    });
    return {
      status: response.status,
      contentType: headerValue(response.headers["content-type"]).toLowerCase(),
      sessionId: headerValue(response.headers["mcp-session-id"]) || null,
      body: response.data
    };
  }
};

class McpListError extends BadRequestError {}

type TJsonRpcMessage = { id?: unknown; method?: unknown; result?: unknown; error?: { message?: unknown } };

// A server request can reuse a client request's id (ids are unique per sender), so only a response answers one.
const isResponseTo = (id: number) => (message: TJsonRpcMessage) => message.id === id && message.method === undefined;

const toMessages = (parsed: unknown): TJsonRpcMessage[] =>
  (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (message): message is TJsonRpcMessage => typeof message === "object" && message !== null
  );

const readText = async (body: Readable, tooLarge: () => McpListError) => {
  const chunks: Buffer[] = [];
  let size = 0;
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of body) {
    size += (chunk as Buffer).length;
    if (size > MAX_MESSAGE_BYTES) {
      body.destroy();
      throw tooLarge();
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
};

// One event per yield, in order. An event's data lines are joined with newlines, as the SSE spec says.
async function* readSseEvents(body: Readable, tooLarge: () => McpListError) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let isStart = true;
  let skipLeadingLf = false;
  let total = 0;
  let event = "";
  let data: string[] = [];
  let dataSize = 0;

  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of body) {
    total += (chunk as Buffer).length;
    if (total > MAX_STREAM_BYTES) throw tooLarge();
    buffer += decoder.write(chunk as Buffer);
    // The stream may start with one BOM, which isn't part of the first field name.
    if (isStart && buffer) {
      if (buffer.startsWith("\uFEFF")) buffer = buffer.slice(1);
      isStart = false;
    }
    // A CR ends its line at once, so an event ending in CRs isn't held until the server sends more. When it
    // ended the last chunk, an LF opening this one is the rest of that CRLF.
    if (skipLeadingLf && buffer) {
      if (buffer.startsWith("\n")) buffer = buffer.slice(1);
      skipLeadingLf = false;
    }
    if (buffer.endsWith("\r")) skipLeadingLf = true;
    const lines = buffer.split(/\r\n|\r|\n/);
    buffer = lines.pop()!;

    // eslint-disable-next-line no-restricted-syntax
    for (const line of lines) {
      if (line === "") {
        if (data.length) yield { event: event || "message", data: data.join("\n") };
        event = "";
        data = [];
        dataSize = 0;
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        if (field === "data") {
          dataSize += value.length;
          if (dataSize > MAX_MESSAGE_BYTES) throw tooLarge();
          data.push(value);
        }
      }
    }
    if (buffer.length > MAX_MESSAGE_BYTES) throw tooLarge();
  }
}

export const listMcpServerTools = async ({
  serverUrl,
  transport,
  headers: authHeaders,
  secrets,
  http = agentVaultMcpHttpClient,
  budgetMs = MCP_TOOL_LIST_BUDGET_MS
}: {
  serverUrl: string;
  transport: AgentVaultMcpTransport;
  // The credential and custom headers, filled in exactly as the proxy would send them.
  headers: Record<string, string>;
  // The same values without their header prefixes, so a server echoing a bare token has it redacted too.
  secrets: string[];
  http?: TMcpHttpClient;
  budgetMs?: number;
}): Promise<TMcpTool[]> => {
  const server = describeServer(serverUrl);
  const transportLabel = transport === AgentVaultMcpTransport.Sse ? "SSE" : "Streamable HTTP";
  const notMcp = (detail = "") =>
    new McpListError({
      message: `'${server}' didn't answer like an MCP server over ${transportLabel}.${detail ? ` ${detail}` : ""} Check the server URL and transport.`
    });
  const tooLarge = () => new McpListError({ message: `'${server}' sent a response too large to read.` });

  const controller = new AbortController();
  const openBodies: Readable[] = [];
  const sensitiveValues = [...Object.values(authHeaders), ...secrets];

  const checkStatus = (response: TMcpHttpResponse) => {
    if (response.status >= 200 && response.status < 300) return;
    response.body.destroy();
    if (response.status === 401 || response.status === 403) {
      throw new McpListError({
        message: `'${server}' rejected the credential (HTTP ${response.status}). Check the token or reauthorize the service, then load the tools again.`
      });
    }
    if (response.status === 429 || response.status >= 500) {
      throw new McpListError({
        message: `'${server}' couldn't answer right now (HTTP ${response.status}). Try again in a few minutes.`
      });
    }
    throw notMcp(`It answered with HTTP ${response.status}.`);
  };

  const send = async (
    url: string,
    method: TMcpHttpMethod,
    extraHeaders: Record<string, string>,
    body?: unknown,
    signal: AbortSignal = controller.signal
  ) => {
    const response = await http.request({
      method,
      url,
      headers: {
        ...authHeaders,
        ...extraHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
    openBodies.push(response.body);
    return response;
  };

  const resultOf = (message: TJsonRpcMessage) => {
    if (message.error) {
      const detail = normalizeProviderText(message.error.message, undefined, sensitiveValues);
      throw new McpListError({
        message: `'${server}' returned an error${detail ? `: ${detail}` : ""}.`
      });
    }
    return message.result;
  };

  // MCP has the receiver answer a ping promptly, and a server may drop a client that doesn't. Not awaited, so the
  // pending response is still read while the answer is in flight. Capped per load, since one batch can hold any
  // number of pings and each answer is a request.
  let pingsAnswered = 0;
  const answerPings = (
    messages: TJsonRpcMessage[],
    reply: (message: Record<string, unknown>) => Promise<TMcpHttpResponse>
  ) => {
    const pings = messages.filter((message) => message.method === "ping" && message.id !== undefined);
    pingsAnswered += pings.length;
    if (pingsAnswered > MAX_PING_REPLIES) {
      throw new McpListError({ message: `'${server}' sent too many pings while listing its tools.` });
    }
    pings.forEach((message) => {
      void reply({ jsonrpc: "2.0", id: message.id, result: {} })
        .then((response) => response.body.destroy())
        .catch(() => {});
    });
  };

  const parseJson = (text: string) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw notMcp();
    }
  };

  const collectTools = async (request: (method: string, params: Record<string, unknown>) => Promise<unknown>) => {
    const tools: TMcpTool[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = (await request("tools/list", cursor ? { cursor } : {})) as {
        tools?: unknown;
        nextCursor?: unknown;
      } | null;
      if (!result || !Array.isArray(result.tools)) throw notMcp("Its tool list wasn't readable.");
      result.tools.forEach((tool: unknown) => {
        const { name, description } = (tool ?? {}) as { name?: unknown; description?: unknown };
        // A name the allowlist would refuse to store could never be allowed, so it isn't offered.
        if (typeof name !== "string" || !toolNameSchema.safeParse(name).success || seen.has(name)) return;
        seen.add(name);
        tools.push({
          name,
          description: normalizeProviderText(description, MAX_DESCRIPTION_LENGTH, sensitiveValues) || null
        });
      });
      if (tools.length > MCP_TOOL_LIST_MAX_TOOLS) {
        throw new McpListError({
          message: `'${server}' lists more than ${MCP_TOOL_LIST_MAX_TOOLS} tools, too many to load.`
        });
      }
      if (typeof result.nextCursor !== "string" || !result.nextCursor) return tools;
      cursor = result.nextCursor;
    }
    throw new McpListError({ message: `'${server}' kept returning more pages of tools.` });
  };

  const initializeParams = { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: MCP_CLIENT_INFO };

  const listOverStreamableHttp = async () => {
    let sessionId: string | null = null;
    let protocolVersion: string | null = null;
    let nextId = 1;

    const sessionHeaders = (): Record<string, string> => ({
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {})
    });

    const request = async (method: string, params: Record<string, unknown>) => {
      const id = nextId;
      nextId += 1;
      const response = await send(serverUrl, AgentVaultHttpMethod.Post, sessionHeaders(), {
        jsonrpc: "2.0",
        id,
        method,
        params
      });
      checkStatus(response);
      if (method === "initialize") sessionId = response.sessionId;

      if (response.contentType.startsWith("application/json")) {
        const match = toMessages(parseJson(await readText(response.body, tooLarge))).find(isResponseTo(id));
        if (!match) throw notMcp();
        return resultOf(match);
      }
      if (response.contentType.startsWith("text/event-stream")) {
        // eslint-disable-next-line no-restricted-syntax
        for await (const { data } of readSseEvents(response.body, tooLarge)) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            // eslint-disable-next-line no-continue
            continue;
          }
          const messages = toMessages(parsed);
          answerPings(messages, (reply) => send(serverUrl, AgentVaultHttpMethod.Post, sessionHeaders(), reply));
          const match = messages.find(isResponseTo(id));
          if (match) {
            response.body.destroy();
            return resultOf(match);
          }
        }
        throw notMcp();
      }
      response.body.destroy();
      throw notMcp();
    };

    try {
      const initialized = (await request("initialize", initializeParams)) as { protocolVersion?: unknown } | null;
      if (typeof initialized?.protocolVersion === "string") protocolVersion = initialized.protocolVersion;

      const notified = await send(serverUrl, AgentVaultHttpMethod.Post, sessionHeaders(), {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      });
      checkStatus(notified);
      notified.body.destroy();

      return await collectTools(request);
    } finally {
      if (sessionId) {
        // Best effort: a server that doesn't support ending sessions answers 405, and one that never answers
        // isn't waited on.
        void send(
          serverUrl,
          AgentVaultHttpMethod.Delete,
          sessionHeaders(),
          undefined,
          AbortSignal.timeout(SESSION_END_TIMEOUT_MS)
        )
          .then((response) => response.body.destroy())
          .catch(() => {});
      }
    }
  };

  const listOverSse = async () => {
    const stream = await send(serverUrl, AgentVaultHttpMethod.Get, { Accept: "text/event-stream" });
    checkStatus(stream);
    if (!stream.contentType.startsWith("text/event-stream")) {
      stream.body.destroy();
      throw notMcp();
    }
    const events = readSseEvents(stream.body, tooLarge);

    const next = async () => {
      const { value, done } = await events.next();
      if (done) throw notMcp("It closed the event stream early.");
      return value;
    };

    let endpointEvent = await next();
    while (endpointEvent.event !== "endpoint") {
      // eslint-disable-next-line no-await-in-loop
      endpointEvent = await next();
    }
    let endpoint: URL;
    try {
      endpoint = new URL(endpointEvent.data.trim(), serverUrl);
    } catch {
      throw notMcp("It announced an endpoint that isn't a URL.");
    }
    // The credential goes only to the server the admin named.
    if (endpoint.origin !== new URL(serverUrl).origin) {
      throw new McpListError({
        message: `'${server}' asked for messages to be sent to another host, so Infisical didn't send the credential there.`
      });
    }

    let nextId = 1;
    const post = async (message: Record<string, unknown>) => {
      const response = await send(
        endpoint.toString(),
        AgentVaultHttpMethod.Post,
        { Accept: "application/json, text/event-stream" },
        message
      );
      checkStatus(response);
      response.body.destroy();
    };

    const request = async (method: string, params: Record<string, unknown>) => {
      const id = nextId;
      nextId += 1;
      await post({ jsonrpc: "2.0", id, method, params });
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { event, data } = await next();
        if (event === "message") {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = null;
          }
          const messages = toMessages(parsed);
          answerPings(messages, (reply) =>
            send(
              endpoint.toString(),
              AgentVaultHttpMethod.Post,
              { Accept: "application/json, text/event-stream" },
              reply
            )
          );
          const match = messages.find(isResponseTo(id));
          if (match) return resultOf(match);
        }
      }
    };

    await request("initialize", initializeParams);
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return collectTools(request);
  };

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, budgetMs);
  // Host validation and stream reads don't all watch the signal, so the budget is also enforced here.
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

  try {
    return await Promise.race([
      transport === AgentVaultMcpTransport.Sse ? listOverSse() : listOverStreamableHttp(),
      aborted
    ]);
  } catch (err) {
    if (err instanceof McpListError) throw err;
    if (err instanceof BadRequestError && err.message === PRIVATE_ADDRESS_REFUSED_MESSAGE) {
      throw new BadRequestError({
        message: `Infisical can't reach '${server}' because it's on a private network.`
      });
    }
    if (timedOut) {
      throw new BadRequestError({
        message: `'${server}' didn't send its tool list within ${budgetMs / 1000} seconds. Try again.`
      });
    }
    // Only the message: an axios error carries the request config, credential headers included.
    const reason = normalizeProviderText(err instanceof Error ? err.message : String(err), undefined, sensitiveValues);
    logger.warn(
      `agentVaultMcpTools: listing tools failed [server=${server}] [transport=${transport}] [reason=${reason}]`
    );
    throw new BadRequestError({
      message: `Couldn't reach '${server}'. Check the server URL and that the server is online.`
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
    openBodies.forEach((body) => body.destroy());
  }
};
