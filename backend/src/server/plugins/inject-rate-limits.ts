import fp from "fastify-plugin";

import { getRateLimiterConfig } from "@app/ee/services/rate-limit/rate-limit-service";

export const injectRateLimits = fp(async (server) => {
  server.decorateRequest("rateLimits", null);
  server.addHook("onRequest", async (req) => {
    const defaultRateLimiterConfig = getRateLimiterConfig();
    if (!req.auth) {
      // for public endpoints
      req.rateLimits = defaultRateLimiterConfig;
      return;
    }

    const plan = await server.services.license.getPlan(req.auth.orgId);
    const { rateLimits } = plan;

    if (plan.customRateLimits) {
      req.rateLimits = defaultRateLimiterConfig;
      return;
    }

    // we're using the null coalescing operator in order to handle outdated licenses
    req.rateLimits = {
      readLimit: rateLimits?.readLimit ?? defaultRateLimiterConfig.readLimit,
      publicEndpointLimit: rateLimits?.publicEndpointLimit ?? defaultRateLimiterConfig.publicEndpointLimit,
      writeLimit: rateLimits?.writeLimit ?? defaultRateLimiterConfig.writeLimit,
      secretsLimit: rateLimits?.secretsLimit ?? defaultRateLimiterConfig.secretsLimit,
      authRateLimit: rateLimits?.authRateLimit ?? defaultRateLimiterConfig.authRateLimit,
      inviteUserRateLimit: rateLimits?.inviteUserRateLimit ?? defaultRateLimiterConfig.inviteUserRateLimit,
      mfaRateLimit: rateLimits?.mfaRateLimit ?? defaultRateLimiterConfig.mfaRateLimit,
      creationLimit: rateLimits?.creationLimit ?? defaultRateLimiterConfig.creationLimit
    };
  });
});
