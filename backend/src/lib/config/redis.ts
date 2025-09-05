import { Redis } from "ioredis";

export type TRedisConfigKeys = Partial<{
  REDIS_URL: string;
  REDIS_USERNAME: string;
  REDIS_PASSWORD: string;

  REDIS_CLUSTER_HOSTS: { host: string; port: number }[];

  REDIS_SENTINEL_HOSTS: { host: string; port: number }[];
  REDIS_SENTINEL_MASTER_NAME: string;
  REDIS_SENTINEL_ENABLE_TLS: boolean;
  REDIS_SENTINEL_USERNAME: string;
  REDIS_SENTINEL_PASSWORD: string;
}>;

export const buildRedisFromConfig = (cfg: TRedisConfigKeys) => {
  if (cfg.REDIS_URL) return new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });

  if (cfg.REDIS_CLUSTER_HOSTS) {
    return new Redis.Cluster(cfg.REDIS_CLUSTER_HOSTS, {
      redisOptions: {
        username: cfg.REDIS_USERNAME,
        password: cfg.REDIS_PASSWORD
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
    password: cfg.REDIS_PASSWORD
  });
};
