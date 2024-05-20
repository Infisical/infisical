import type { RateLimitOptions, RateLimitPluginOptions } from "@fastify/rate-limit";
import { FastifyRequest } from "fastify";
import { Redis } from "ioredis";

import { getConfig } from "@app/lib/config/env";
import { ActorType } from "@app/services/auth/auth-type";

const getDistinctRequestActorId = (req: FastifyRequest) => {
  if (req?.auth?.actor === ActorType.USER) {
    return req.auth.user.username;
  }
  if (req?.auth?.actor === ActorType.IDENTITY) {
    return `identity-${req.auth.identityId}`;
  }
  if (req?.auth?.actor === ActorType.SERVICE) {
    return (
      `${req.auth.serviceToken.createdByEmail}-service-token` || `service-token-null-creator-${req.auth.serviceTokenId}`
    ); // when user gets removed from system
  }
  return req.realIp;
};

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
    keyGenerator: (req) => getDistinctRequestActorId(req)
  };
};

// GET endpoints
export const readLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 600,
  keyGenerator: (req) => getDistinctRequestActorId(req)
};

// POST, PATCH, PUT, DELETE endpoints
export const writeLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 50,
  keyGenerator: (req) => getDistinctRequestActorId(req)
};

// special endpoints
export const secretsLimit: RateLimitOptions = {
  // secrets, folders, secret imports
  timeWindow: 60 * 1000,
  max: 1000,
  keyGenerator: (req) => getDistinctRequestActorId(req)
};

export const authRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 60,
  keyGenerator: (req) => getDistinctRequestActorId(req)
};

export const inviteUserRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 30,
  keyGenerator: (req) => getDistinctRequestActorId(req)
};

export const creationLimit: RateLimitOptions = {
  // identity, project, org
  timeWindow: 60 * 1000,
  max: 30,
  keyGenerator: (req) => getDistinctRequestActorId(req)
};
