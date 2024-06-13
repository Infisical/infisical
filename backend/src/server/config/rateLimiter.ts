import type { RateLimitOptions, RateLimitPluginOptions } from "@fastify/rate-limit";
import { Redis } from "ioredis";

import { TRateLimit } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";

export const rateLimitMaxConfiguration = {
  readLimit: 60,
  publicEndpointLimit: 30,
  writeLimit: 200,
  secretsLimit: 60,
  authRateLimit: 60,
  inviteUserRateLimit: 30,
  mfaRateLimit: 20,
  creationLimit: 30
};

// GET endpoints
export const readLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.readLimit,
  keyGenerator: (req) => req.realIp
};

// POST, PATCH, PUT, DELETE endpoints
export const writeLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.writeLimit, // (too low, FA having issues so increasing it - maidul)
  keyGenerator: (req) => req.realIp
};

// special endpoints
export const secretsLimit: RateLimitOptions = {
  // secrets, folders, secret imports
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.secretsLimit,
  keyGenerator: (req) => req.realIp
};

export const authRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.authRateLimit,
  keyGenerator: (req) => req.realIp
};

export const inviteUserRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.inviteUserRateLimit,
  keyGenerator: (req) => req.realIp
};

export const mfaRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.mfaRateLimit,
  keyGenerator: (req) => {
    return req.headers.authorization?.split(" ")[1] || req.realIp;
  }
};

export const creationLimit: RateLimitOptions = {
  // identity, project, org
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.creationLimit,
  keyGenerator: (req) => req.realIp
};

// Public endpoints to avoid brute force attacks
export const publicEndpointLimit: RateLimitOptions = {
  // Shared Secrets
  timeWindow: 60 * 1000,
  max: () => rateLimitMaxConfiguration.publicEndpointLimit,
  keyGenerator: (req) => req.realIp
};

export const globalRateLimiterCfg = async (customRateLimits?: TRateLimit): Promise<RateLimitPluginOptions> => {
  const appCfg = getConfig();
  const redis = appCfg.isRedisConfigured
    ? new Redis(appCfg.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    : null;

  if (customRateLimits) {
    rateLimitMaxConfiguration.readLimit = customRateLimits.readRateLimit;
    rateLimitMaxConfiguration.publicEndpointLimit = customRateLimits.publicEndpointLimit;
    rateLimitMaxConfiguration.writeLimit = customRateLimits.writeRateLimit;
    rateLimitMaxConfiguration.secretsLimit = customRateLimits.secretsRateLimit;
    rateLimitMaxConfiguration.authRateLimit = customRateLimits.authRateLimit;
    rateLimitMaxConfiguration.inviteUserRateLimit = customRateLimits.inviteUserRateLimit;
    rateLimitMaxConfiguration.mfaRateLimit = customRateLimits.mfaRateLimit;
    rateLimitMaxConfiguration.creationLimit = customRateLimits.creationLimit;
  }

  return {
    timeWindow: 60 * 1000,
    max: 600,
    redis,
    allowList: (req) => req.url === "/healthcheck" || req.url === "/api/status",
    keyGenerator: (req) => req.realIp
  };
};
