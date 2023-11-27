import type { RateLimitOptions } from "@fastify/rate-limit";

export const globalRateLimiterCfg: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.realIp
};
