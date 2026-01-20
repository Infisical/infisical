import Redis from "ioredis";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { RedisConnectionMethod } from "./redis-connection-enums";
import { TRedisConnectionConfig } from "./redis-connection-types";

export const getRedisConnectionListItem = () => {
  return {
    name: "Redis" as const,
    app: AppConnection.Redis as const,
    methods: Object.values(RedisConnectionMethod) as [RedisConnectionMethod.UsernameAndPassword],
    supportsPlatformManagement: false as const
  };
};

export const validateRedisConnectionCredentials = async (config: TRedisConnectionConfig) => {
  const [hostIp] = await verifyHostInputValidity({ host: config.credentials.host, isDynamicSecret: false });

  let connection: Redis | null = null;
  try {
    connection = new Redis({
      username: config.credentials.username,
      host: hostIp,
      port: config.credentials.port,
      password: config.credentials.password,
      ...(config.credentials.sslEnabled && {
        tls: {
          rejectUnauthorized: config.credentials.sslRejectUnauthorized,
          ca: config.credentials.sslCertificate
        }
      })
    });

    let result: string;
    if (config.credentials.password) {
      result = await connection.auth(config.credentials.username, config.credentials.password, () => {});
    } else {
      result = await connection.auth(config.credentials.username, () => {});
    }

    if (result !== "OK") {
      throw new BadRequestError({ message: `Invalid credentials, Redis returned ${result} status` });
    }

    return config.credentials;
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(err as Error)?.message || "verify credentials"}`
    });
  } finally {
    if (connection) await connection.quit();
  }
};
