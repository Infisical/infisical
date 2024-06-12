import type { RateLimitOptions, RateLimitPluginOptions } from "@fastify/rate-limit";
import { Redis } from "ioredis";
import { Knex } from "knex";

import { getConfig } from "@app/lib/config/env";
import { rateLimitDALFactory } from "@app/services/rate-limit/rate-limit-dal";
import { rateLimitServiceFactory } from "@app/services/rate-limit/rate-limit-service";

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
  // Shared Secrets
  timeWindow: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.realIp
};

async function fetchRateLimitsFromDb(db: Knex) {
  try {
    const rateLimitDAL = rateLimitDALFactory(db);
    const rateLimits = await rateLimitServiceFactory({ rateLimitDAL }).getRateLimits();

    readLimit.max = rateLimits.readRateLimit;
    publicEndpointLimit.max = rateLimits.publicEndpointLimit;
    writeLimit.max = rateLimits.writeRateLimit;
    secretsLimit.max = rateLimits.secretsRateLimit;
    authRateLimit.max = rateLimits.authRateLimit;
    inviteUserRateLimit.max = rateLimits.inviteUserRateLimit;
    mfaRateLimit.max = rateLimits.mfaRateLimit;
    creationLimit.max = rateLimits.creationLimit;
  } catch (error) {
    console.error("Error fetching rate limits:", error);
  }
}

export const globalRateLimiterCfg = async (db: Knex): Promise<RateLimitPluginOptions> => {
  const appCfg = getConfig();
  const redis = appCfg.isRedisConfigured
    ? new Redis(appCfg.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    : null;

  await fetchRateLimitsFromDb(db);

  return {
    timeWindow: 60 * 1000,
    max: 600,
    redis,
    allowList: (req) => req.url === "/healthcheck" || req.url === "/api/status",
    keyGenerator: (req) => req.realIp
  };
};
