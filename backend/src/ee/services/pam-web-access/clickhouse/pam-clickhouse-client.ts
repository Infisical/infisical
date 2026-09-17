import { type ClickHouseClient, ClickHouseError, createClient } from "@clickhouse/client";
import { Readable } from "stream";

import { BadRequestError } from "@app/lib/errors";

const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 30 * 1000;

export const MAX_RESULT_BYTES = 16 * 1024 * 1024;

export const createRelayClient = (opts: {
  relayPort: number;
  database?: string;
  sessionId?: string;
}): ClickHouseClient =>
  createClient({
    url: `http://127.0.0.1:${opts.relayPort}`,
    database: opts.database || "default",
    session_id: opts.sessionId,
    request_timeout: REQUEST_TIMEOUT_MS,
    max_open_connections: 2,
    compression: { request: false, response: false },
    application: "Infisical"
  });

export const openRelayClient = async (opts: {
  relayPort: number;
  database?: string;
  sessionId: string;
}): Promise<ClickHouseClient> => {
  const client = createRelayClient(opts);
  try {
    const probe = await client.query({
      query: "SELECT 1",
      format: "JSON",
      abort_signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS)
    });
    await probe.json();
    return client;
  } catch (err) {
    await client.close().catch(() => {});
    throw new BadRequestError({
      message: `Unable to open a ClickHouse session through the gateway: ${(err as Error)?.message ?? "connection failed"}`
    });
  }
};

export const withOneShotClient = async <T>(
  opts: { relayPort: number; database?: string },
  fn: (client: ClickHouseClient) => Promise<T>
): Promise<T> => {
  const client = createRelayClient(opts);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
};

export const verifyRelayReachable = async (opts: { relayPort: number; database?: string }): Promise<void> => {
  try {
    await withOneShotClient(opts, async (client) => {
      const result = await client.query({
        query: "SELECT 1",
        format: "JSON",
        abort_signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS)
      });
      await result.json();
    });
  } catch (err) {
    throw new BadRequestError({
      message: `Unable to reach ClickHouse through the gateway: ${(err as Error)?.message ?? "connection failed"}`
    });
  }
};

export const readStreamText = async (
  stream: Readable,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> => {
  // Stops an unhandled 'error' from taking the process down once iteration has moved on
  stream.on("error", () => {});

  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      const remaining = maxBytes - total;
      if (buffer.length >= remaining) {
        chunks.push(buffer.subarray(0, remaining));
        total = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(buffer);
      total += buffer.length;
    }
  } finally {
    stream.destroy();
  }

  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
};

export class ClickhouseResultTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(
      `This statement returned more than the ${Math.round(maxBytes / (1024 * 1024))} MB a browser session can hold. ` +
        `Narrow the query, or use the CLI with your own client to read the full result.`
    );
    this.name = "ClickhouseResultTooLargeError";
  }
}

export const clickhouseErrorFields = (err: unknown): { message?: string; detail?: string } => {
  if (err instanceof ClickHouseError) {
    return { message: err.message, detail: err.type ? `${err.type} (code ${err.code})` : `Code ${err.code}` };
  }
  return { message: (err as Error)?.message };
};

const CONNECTION_ERROR_CODES = ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ERR_SOCKET_CONNECTION_TIMEOUT"];

// A ClickHouseError is the server answering, so only transport failures mean the tunnel is gone
export const isRelayGoneError = (err: unknown): boolean => {
  if (err instanceof ClickHouseError) return false;
  const code = (err as { code?: string })?.code;
  if (code && CONNECTION_ERROR_CODES.includes(code)) return true;
  const message = (err as Error)?.message ?? "";
  return message.includes("socket hang up") || message.includes("ECONNREFUSED") || message.includes("ECONNRESET");
};
