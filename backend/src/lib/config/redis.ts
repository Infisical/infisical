import { Redis } from "ioredis";

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

export const buildRedisFromConfig = (cfg: TRedisConfigKeys) => {
  if (cfg.REDIS_URL) {
    return new Redis(cfg.REDIS_URL, {
      maxRetriesPerRequest: null,
      reconnectOnError(err) {
        // Reconnect when hitting a read-only replica during failover
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return true; // Reconnect
        }
        return false;
      }
    });
  }

  if (cfg.REDIS_CLUSTER_HOSTS) {
    return new Redis.Cluster(cfg.REDIS_CLUSTER_HOSTS, {
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
            return true;
          }
          return false;
        }
      }
    });
  }

  return new Redis({
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
        return true; // Reconnect
      }
      return false;
    }
  });
};
