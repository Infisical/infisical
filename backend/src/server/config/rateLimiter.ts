import type { RateLimitOptions, RateLimitPluginOptions } from "@fastify/rate-limit";
import { Redis } from "ioredis";

import { getConfig } from "@app/lib/config/env";

export const globalRateLimiterCfg = (): RateLimitPluginOptions => {
  const appCfg = getConfig();
  const redis = appCfg.isRedisConfigured
    ? new Redis(appCfg.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    : null;

  return {
    timeWindow: 60 * 1000,
    max: 600,
    redis,
    allowList: (req) => req.url === "/healthcheck" || req.url === "/api/status",
    keyGenerator: (req) => req.realIp
  };
};

// GET endpoints
export const readLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 600,
  keyGenerator: (req) => req.realIp
};

// POST, PATCH, PUT, DELETE endpoints
export const writeLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 200, // (too low, FA having issues so increasing it - maidul)
  keyGenerator: (req) => req.realIp
};

// special endpoints
export const secretsLimit: RateLimitOptions = {
  // secrets, folders, secret imports
  timeWindow: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.realIp
};

export const authRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.realIp
};

export const inviteUserRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.realIp
};

export const mfaRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 20,
  keyGenerator: (req) => {
    return req.headers.authorization?.split(" ")[1] || req.realIp;
  }
};

export const creationLimit: RateLimitOptions = {
  // identity, project, org
  timeWindow: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.realIp
};

// Public endpoints to avoid brute force attacks
export const publicEndpointLimit: RateLimitOptions = {
  // Read Shared Secrets
  timeWindow: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.realIp
};

export const publicSecretShareCreationLimit: RateLimitOptions = {
  // Create Shared Secrets
  timeWindow: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.realIp
};
