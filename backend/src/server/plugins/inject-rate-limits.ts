import fp from "fastify-plugin";

import { getRateLimiterConfig } from "@app/ee/services/rate-limit/rate-limit-service";
import { getConfig } from "@app/lib/config/env";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

export const injectRateLimits = fp(async (server) => {
  server.decorateRequest("rateLimits");
  server.addHook("onRequest", async (req) => {
    const appCfg = getConfig();

    const instanceRateLimiterConfig = getRateLimiterConfig();
    if (!req.auth?.orgId) {
      // for public endpoints, we always use the instance-wide default rate limits
      req.rateLimits = instanceRateLimiterConfig;
      return;
    }

    const { orgId } = req.auth;
    const { rateLimits, customRateLimits } = await requestMemoize(requestMemoKeys.licensePlan(orgId), () =>
      server.services.license.getPlan(orgId)
    );

    if (customRateLimits && !appCfg.isCloud) {
      // we do this because for self-hosted/dedicated instances, we want custom rate limits to be based on admin configuration
      // note that the syncing of custom rate limit happens on the instanceRateLimiterConfig object
      req.rateLimits = instanceRateLimiterConfig;
      return;
    }

    // we're using the null coalescing operator in order to handle outdated licenses
    req.rateLimits = {
      readLimit: rateLimits?.readLimit ?? instanceRateLimiterConfig.readLimit,
      writeLimit: rateLimits?.writeLimit ?? instanceRateLimiterConfig.writeLimit,
      secretsLimit: rateLimits?.secretsLimit ?? instanceRateLimiterConfig.secretsLimit,
      publicEndpointLimit: instanceRateLimiterConfig.publicEndpointLimit,
      authRateLimit: instanceRateLimiterConfig.authRateLimit,
      inviteUserRateLimit: instanceRateLimiterConfig.inviteUserRateLimit,
      mfaRateLimit: instanceRateLimiterConfig.mfaRateLimit,
      identityCreationLimit: instanceRateLimiterConfig.identityCreationLimit,
      projectCreationLimit: instanceRateLimiterConfig.projectCreationLimit
    };
  });
});
