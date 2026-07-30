import { Cluster, Redis } from "ioredis";

import { logger } from "@app/lib/logger";

export type TRedisConfigKeys = Partial<{
  REDIS_URL: string;
  REDIS_USERNAME: string;
  REDIS_PASSWORD: string;

  REDIS_CLUSTER_HOSTS: { host: string; port: number }[];
  REDIS_CLUSTER_ENABLE_TLS: boolean;
  // ref: https://github.com/redis/ioredis?tab=readme-ov-file#special-note-aws-elasticache-clusters-with-tls
  REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE: boolean;

  REDIS_SENTINEL_HOSTS: { host: string; port: number }[];
  REDIS_SENTINEL_MASTER_NAME: string;
  REDIS_SENTINEL_ENABLE_TLS: boolean;
  REDIS_SENTINEL_USERNAME: string;
  REDIS_SENTINEL_PASSWORD: string;
}>;

const REDIS_ERROR_LOG_THROTTLE_MS = 10_000;

const attachConnectionLogging = (client: Redis | Cluster) => {
  let lastLoggedAt = 0;
  let isDown = false;

  client.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < REDIS_ERROR_LOG_THROTTLE_MS) return;

    lastLoggedAt = now;
    isDown = true;
    logger.error({ err }, `Redis connection error [error=${err.message}]`);
  });

  client.on("ready", () => {
    // Skip the initial connect; only a recovery is worth a line.
    if (!isDown) return;
    isDown = false;
    lastLoggedAt = 0;
    logger.info("Redis connection restored");
  });

  return client;
};

export const buildRedisFromConfig = (cfg: TRedisConfigKeys) => {
  if (cfg.REDIS_URL) {
    return attachConnectionLogging(
      new Redis(cfg.REDIS_URL, {
        maxRetriesPerRequest: null,
        reconnectOnError(err) {
          // Reconnect when hitting a read-only replica during failover
          const targetError = "READONLY";
          if (err.message.includes(targetError)) {
            return 2; // Reconnect and resend command
          }
          return false;
        }
      })
    );
  }

  if (cfg.REDIS_CLUSTER_HOSTS) {
    return attachConnectionLogging(
      new Redis.Cluster(cfg.REDIS_CLUSTER_HOSTS, {
        dnsLookup: cfg.REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE
          ? (address, callback) => callback(null, address)
          : undefined,
        retryDelayOnClusterDown: 300,
        redisOptions: {
          username: cfg.REDIS_USERNAME,
          password: cfg.REDIS_PASSWORD,
          tls: cfg?.REDIS_CLUSTER_ENABLE_TLS ? {} : undefined,
          reconnectOnError(err) {
            const targetError = "READONLY";
            if (err.message.includes(targetError)) {
              return 2; // Reconnect and resend command
            }
            return false;
          }
        }
      })
    );
  }

  return attachConnectionLogging(
    new Redis({
      // refine at tope will catch this case
      sentinels: cfg.REDIS_SENTINEL_HOSTS!,
      name: cfg.REDIS_SENTINEL_MASTER_NAME!,
      maxRetriesPerRequest: null,
      sentinelUsername: cfg.REDIS_SENTINEL_USERNAME,
      sentinelPassword: cfg.REDIS_SENTINEL_PASSWORD,
      enableTLSForSentinelMode: cfg.REDIS_SENTINEL_ENABLE_TLS,
      username: cfg.REDIS_USERNAME,
      password: cfg.REDIS_PASSWORD,
      reconnectOnError(err) {
        // Reconnect when hitting a read-only replica during failover
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return 2; // Reconnect and resend command
        }
        return false;
      }
    })
  );
};
