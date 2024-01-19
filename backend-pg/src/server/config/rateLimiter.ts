import type { RateLimitOptions, RateLimitPluginOptions } from "@fastify/rate-limit";
import { Redis } from "ioredis";

import { getConfig } from "@app/lib/config/env";

export const globalRateLimiterCfg = (): RateLimitPluginOptions => {
  const appCfg = getConfig();
  const redis = appCfg.isRedisConfigured
    ? new Redis(appCfg.REDIS_URL as string, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    : null;

  return {
    timeWindow: 60 * 1000,
    max: 100,
    redis,
    allowList: (req) => req.url === "/healthcheck" || req.url === "/api/status",
    keyGenerator: (req) => req.realIp
  };
};

export const authRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 300,
  keyGenerator: (req) => req.realIp
};

export const passwordRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 300,
  keyGenerator: (req) => req.realIp
};
