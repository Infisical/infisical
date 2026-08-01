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

// The error channel carries more than socket failures: auth failures (NOAUTH/WRONGPASS) reach it via
// recoverFromFatalError, as do cluster slot-refresh failures. So the throttle is keyed per normalized error code.
// Keying on err.message instead would grow unbounded, since cluster messages embed host:port.
const getRedisErrorKey = (err: Error) => {
  const { code } = err as Error & { code?: string };
  if (code) return code; // ECONNREFUSED, ETIMEDOUT, ...

  const replyPrefix = /^([A-Z]{4,})/.exec(err.message)?.[1];
  if (replyPrefix) return replyPrefix; // NOAUTH, WRONGPASS, CLUSTERDOWN, ...

  return err.name;
};

/**
 * Attaches throttled, named connection logging to a client. Call this on any client not built by
 * `buildRedisFromConfig`. Specifically `duplicate()`d clients, since `duplicate()` copies options but not listeners.
 */
export const attachConnectionLogging = (client: Redis | Cluster, name: string) => {
  const throttleByErrorKey = new Map<string, { lastLoggedAt: number; suppressedCount: number }>();
  let isDown = false;

  const logConnectionError = (err: Error, nodeAddress?: string) => {
    const errorKey = getRedisErrorKey(err);
    // Nodes are bucketed separately so one failing node can't absorb another's line. Still bounded,
    // unlike keying on err.message, since a cluster has a fixed node count.
    const throttleKey = nodeAddress ? `${errorKey}:${nodeAddress}` : errorKey;
    const now = Date.now();
    const throttle = throttleByErrorKey.get(throttleKey);

    if (throttle && now - throttle.lastLoggedAt < REDIS_ERROR_LOG_THROTTLE_MS) {
      throttle.suppressedCount += 1;
      return;
    }

    const suppressedCount = throttle?.suppressedCount ?? 0;
    throttleByErrorKey.set(throttleKey, { lastLoggedAt: now, suppressedCount: 0 });
    logger.error(
      { err, redisClient: name, redisErrorKey: errorKey, redisNode: nodeAddress, suppressedCount },
      `Redis connection error [client=${name}] [error=${errorKey}]${nodeAddress ? ` [node=${nodeAddress}]` : ""} [suppressedCount=${suppressedCount}] [message=${err.message}]`
    );
  };

  client.on("error", (err: Error) => logConnectionError(err));

  if (client instanceof Cluster) {
    client.on("node error", (err: Error, nodeAddress: string) => logConnectionError(err, nodeAddress));
  }

  client.on("close", () => {
    isDown = true;
  });

  client.on("ready", () => {
    // Must clear, otherwise stale timestamps would throttle the first error of the next outage.
    throttleByErrorKey.clear();

    // Skip the initial connect; only a recovery is worth a line.
    if (!isDown) return;
    isDown = false;
    logger.info({ redisClient: name }, `Redis connection restored [client=${name}]`);
  });

  return client;
};

export const buildRedisFromConfig = (cfg: TRedisConfigKeys, name = "unknown") => {
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
      }),
      name
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
      }),
      name
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
    }),
    name
  );
};
