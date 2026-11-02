import { createClient } from "@clickhouse/client";

import { BadRequestError } from "@app/lib/errors";
import { buildUncachedSsrfSafeAgent } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ClickHouseConnectionMethod } from "./clickhouse-connection-enums";
import { TClickHouseConnection, TClickHouseConnectionConfig } from "./clickhouse-connection-types";

const REQUEST_TIMEOUT_MS = 10_000;

export const getClickHouseConnectionListItem = () => {
  return {
    name: "ClickHouse" as const,
    app: AppConnection.ClickHouse as const,
    methods: Object.values(ClickHouseConnectionMethod) as [ClickHouseConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: false as const
  };
};

type TCreateClickHouseClientOptions = {
  authCredentials?: { username: string; password: string };
  validateConnection?: boolean;
};

export const createClickHouseClient = async (
  credentials: TClickHouseConnection["credentials"],
  options?: TCreateClickHouseClientOptions
) => {
  const host = credentials.host.replace(/^https?:\/\//, "");
  const url = `${credentials.sslEnabled ? "https" : "http"}://${host}:${credentials.port}`;

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
      await client.command({ query: "SELECT 1" });
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
