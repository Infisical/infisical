import type { RateLimitOptions, RateLimitPluginOptions } from "@fastify/rate-limit";

import { getConfig } from "@app/lib/config/env";
import { buildRedisFromConfig } from "@app/lib/config/redis";
import { RateLimitError } from "@app/lib/errors";

export const globalRateLimiterCfg = (): RateLimitPluginOptions => {
  const appCfg = getConfig();
  const redis = appCfg.isRedisConfigured ? buildRedisFromConfig(appCfg, "rate-limiter") : null;

  return {
    errorResponseBuilder: (_, context) => {
      throw new RateLimitError({
        message: `Rate limit exceeded. Please try again in ${Math.ceil(context.ttl / 1000)} seconds`
      });
    },
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
  hook: "preValidation",
  max: (req) => req.rateLimits.readLimit,
  keyGenerator: (req) => req.realIp
};

// POST, PATCH, PUT, DELETE endpoints
export const writeLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.writeLimit,
  keyGenerator: (req) => req.realIp
};

// Gateways report load every 10s (6/min each), so 10 leaves room for tick drift and a restart
// landing in the same window without leaving headroom for a flood. Keyed by the reporting gateway
// rather than by IP, because the write limiter's IP key is shared: ~100 gateways behind one NAT
// address would exhaust a 200/min quota on load reports alone, start getting 429s, and their
// entries would go stale.
export const gatewayMetricsReportLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: 10,
  keyGenerator: (req) => {
    const actorId = (req as { permission?: { id?: string } }).permission?.id;
    return actorId ? `gateway-metrics:${actorId}` : req.realIp;
  }
};

// Agent Vault proxy endpoints key on the proxy identity, not the source IP: many proxies behind one NAT
// would otherwise share a bucket and 429 each other. Both need inject-permission's Agent Vault arm, or
// req.permission is undefined and they silently fall back to the shared IP bucket.
//
// The ceiling is sized off the proxy's 4,096-entry session cache rather than copied from
// gatewayMetricsReportLimit: one proxy makes one resolve call per live session per poll interval, so that
// endpoint's max of 10 would fail closed past ten concurrent sessions.
export const agentVaultResolveLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: 4200,
  keyGenerator: (req) => {
    const actorId = (req as { permission?: { id?: string } }).permission?.id;
    return actorId ? `agent-vault-resolve:${actorId}` : req.realIp;
  }
};

// Genuinely once per tick, so this one stays small. The floor poll interval is 10s.
export const agentVaultHeartbeatLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: 30,
  keyGenerator: (req) => {
    const actorId = (req as { permission?: { id?: string } }).permission?.id;
    return actorId ? `agent-vault-heartbeat:${actorId}` : req.realIp;
  }
};

// special endpoints
export const secretsLimit: RateLimitOptions = {
  // secrets, folders, secret imports
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.secretsLimit,
  keyGenerator: (req) => req.realIp
};

export const authRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.authRateLimit,
  keyGenerator: (req) => req.realIp
};

export const inviteUserRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.inviteUserRateLimit,
  keyGenerator: (req) => req.realIp
};

export const mfaRateLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.mfaRateLimit,
  keyGenerator: (req) => {
    return req.headers.authorization?.split(" ")[1] || req.realIp;
  }
};

// Public endpoints to avoid brute force attacks
export const publicEndpointLimit: RateLimitOptions = {
  // Read Shared Secrets
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.publicEndpointLimit,
  keyGenerator: (req) => req.realIp
};

export const publicSecretShareCreationLimit: RateLimitOptions = {
  // Create Shared Secrets
  timeWindow: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.realIp
};

export const userEngagementLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.realIp
};

export const invalidateCacheLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: 2,
  keyGenerator: (req) => req.realIp
};

// Makes spamming "request access" harder, preventing email DDoS
export const requestAccessLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: 10,
  keyGenerator: (req) => req.realIp
};

export const smtpRateLimit = ({
  keyGenerator = (req) => req.realIp
}: Pick<RateLimitOptions, "keyGenerator"> = {}): RateLimitOptions => ({
  timeWindow: 40 * 1000,
  hook: "preValidation",
  max: 2,
  keyGenerator
});

export const identityCreationLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.identityCreationLimit,
  keyGenerator: (req) => req.realIp
};

export const projectCreationLimit: RateLimitOptions = {
  timeWindow: 60 * 1000,
  hook: "preValidation",
  max: (req) => req.rateLimits.projectCreationLimit,
  keyGenerator: (req) => req.realIp
};
