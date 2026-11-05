import { isIPv6 } from "node:net";
import { Readable } from "node:stream";
import { gunzipSync } from "node:zlib";

import { ClickHouseClient, createClient } from "@clickhouse/client";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
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

const readResponse = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  let size = 0;
  // throwing out of the loop destroys the stream, so an oversized response stops downloading
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) throw new Error("ClickHouse returned a response larger than 1 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

// The client decompresses and buffers a whole error response before throwing, so a small gzip
// body could expand to hundreds of megabytes. Read the raw response with a size cap instead.
export const executeClickHouseStatement = async (client: ClickHouseClient, query: string) => {
  const response = await client.exec({ query, decompress_response_stream: false, ignore_error_response: true });
  const body = await readResponse(response.stream);
  const status = response.http_status_code ?? 0;
  if (status >= 200 && status < 300) return;

  let errorText: string;
  try {
    errorText = (
      response.response_headers["content-encoding"] === "gzip"
        ? gunzipSync(body, { maxOutputLength: MAX_RESPONSE_BYTES })
        : body
    ).toString();
  } catch {
    throw new Error("ClickHouse returned an error response Infisical couldn't read");
  }
  // not the client's parseError: its regex backtracks for seconds on a crafted error body
  throw new Error(errorText);
};

const buildUrl = (sslEnabled: boolean, host: string, port: number) =>
  `${sslEnabled ? "https" : "http"}://${isIPv6(host) ? `[${host}]` : host}:${port}`;

const runWithClient = async <T>(
  credentials: TClickHouseConnection["credentials"],
  operation: (client: ClickHouseClient) => Promise<T>,
  proxyPort?: number
) => {
  const targetUrl = buildUrl(credentials.sslEnabled, credentials.host, credentials.port);
  const isProxied = proxyPort !== undefined;
  const url = isProxied ? buildUrl(credentials.sslEnabled, "localhost", proxyPort) : targetUrl;

  const client = createClient({
    url,
    username: credentials.username,
    password: credentials.password,
    database: credentials.database,
    request_timeout: REQUEST_TIMEOUT_MS,
    // through the gateway's local proxy, requests and TLS still name the real server, and there is
    // nothing to validate or pin. Direct connections pin DNS to the IPs that pass validation.
    ...(isProxied && { http_headers: { Host: new URL(targetUrl).host } }),
    http_agent: await buildUncachedSsrfSafeAgent(url, {
      ca: credentials.sslCertificate,
      rejectUnauthorized: credentials.sslRejectUnauthorized,
      ...(isProxied && { allowPrivateIps: true, servername: credentials.host })
    })
  });

  try {
    return await operation(client);
  } finally {
    await client.close();
  }
};

type TClickHouseGatewayDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export const executeWithClickHouseClient = async <T>(
  connection: Pick<TClickHouseConnection, "credentials" | "gatewayId" | "gatewayPoolId">,
  { gatewayV2Service, gatewayPoolService }: TClickHouseGatewayDeps,
  operation: (client: ClickHouseClient) => Promise<T>
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = connection;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This ClickHouse connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  if (gatewayId) {
    const [targetHost] = await verifyHostInputValidity({
      host: credentials.host,
      isGateway: true,
      isDynamicSecret: false
    });
    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost,
      targetPort: credentials.port
    });

    // Falling through to the direct path here would silently bypass the gateway the connection is
    // pinned to and dial the target host from the platform instead.
    if (!platformConnectionDetails) {
      throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
    }

    return withGatewayV2Proxy((proxyPort) => runWithClient(credentials, operation, proxyPort), {
      protocol: GatewayProxyProtocol.Tcp,
      ...platformConnectionDetails
    });
  }

  return runWithClient(credentials, operation);
};

export const validateClickHouseConnectionCredentials = async (
  config: TClickHouseConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeWithClickHouseClient(config, { gatewayV2Service }, (client) =>
      executeClickHouseStatement(client, "SELECT 1")
    );

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
