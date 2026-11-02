import { isIPv6 } from "node:net";
import { Readable } from "node:stream";
import { gunzipSync } from "node:zlib";

import { ClickHouseClient, createClient, parseError } from "@clickhouse/client";

import { BadRequestError } from "@app/lib/errors";
import { buildUncachedSsrfSafeAgent } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ClickHouseConnectionMethod } from "./clickhouse-connection-enums";
import { TClickHouseConnection, TClickHouseConnectionConfig } from "./clickhouse-connection-types";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export const getClickHouseConnectionListItem = () => {
  return {
    name: "ClickHouse" as const,
    app: AppConnection.ClickHouse as const,
    methods: Object.values(ClickHouseConnectionMethod) as [ClickHouseConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: false as const
  };
};

const readResponse = (stream: Readable) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        stream.destroy();
        reject(new Error("ClickHouse returned a response larger than 1 MB"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

// The client decompresses and buffers a whole error response before throwing, so a small gzip
// body could expand to hundreds of megabytes. Read the raw response with a size cap instead.
export const executeClickHouseStatement = async (client: ClickHouseClient, query: string) => {
  const {
    stream,
    http_status_code: statusCode,
    response_headers: headers
  } = await client.exec({ query, decompress_response_stream: false, ignore_error_response: true });

  const body = await readResponse(stream);
  if (statusCode && statusCode >= 200 && statusCode < 300) return;

  let errorText: string;
  try {
    errorText = (
      headers["content-encoding"] === "gzip" ? gunzipSync(body, { maxOutputLength: MAX_RESPONSE_BYTES }) : body
    ).toString();
  } catch {
    throw new Error("ClickHouse returned an error response Infisical couldn't read");
  }
  throw parseError(errorText);
};

type TCreateClickHouseClientOptions = {
  authCredentials?: { username: string; password: string };
  validateConnection?: boolean;
};

export const createClickHouseClient = async (
  credentials: TClickHouseConnection["credentials"],
  options?: TCreateClickHouseClientOptions
) => {
  const { host } = credentials;
  const url = `${credentials.sslEnabled ? "https" : "http"}://${isIPv6(host) ? `[${host}]` : host}:${credentials.port}`;

  const { username, password } = options?.authCredentials ?? credentials;

  const client = createClient({
    url,
    username,
    password,
    database: credentials.database,
    request_timeout: REQUEST_TIMEOUT_MS,
    // pins DNS to the validated IPs, and carries the TLS options the client's own tls config can't express
    http_agent: await buildUncachedSsrfSafeAgent(url, {
      ca: credentials.sslCertificate,
      rejectUnauthorized: credentials.sslRejectUnauthorized
    })
  });

  if (options?.validateConnection) {
    try {
      await executeClickHouseStatement(client, "SELECT 1");
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  return client;
};

export const validateClickHouseConnectionCredentials = async (config: TClickHouseConnectionConfig) => {
  try {
    const client = await createClickHouseClient(config.credentials, { validateConnection: true });
    await client.close();

    return config.credentials;
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(err as Error)?.message || "verify credentials"}`
    });
  }
};
