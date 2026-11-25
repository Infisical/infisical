import fp from "fastify-plugin";

import { Plan } from "@app/domains/platform/license/ce/module";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { DEFAULT_RATE_LIMITS } from "@app/server/config/rateLimiter";

export const injectRateLimits = fp(async (server) => {
  const getLastKnownPlan = async (orgId: string, fallbackPlan: Plan) => {
    try {
      const lastKnown = await server.services.licenseService.getLastKnownPlan(orgId);
      return lastKnown?.plan ?? fallbackPlan;
    } catch (error) {
      logger.warn(error, `injectRateLimits: failed to read the last known plan [orgId=${orgId}]`);
      return fallbackPlan;
    }
  };

  server.decorateRequest("rateLimits");
  server.decorateRequest("rateLimitPlanSlug", null);
  server.addHook("onRequest", async (req) => {
    if (!req.auth?.orgId) {
      req.rateLimits = DEFAULT_RATE_LIMITS;
      return;
    }

    const { orgId } = req.auth;
    const plan = await requestMemoize(requestMemoKeys.licensePlan(orgId), () =>
      server.services.licenseService.getPlan(orgId)
    );
    const { rateLimits, slug } = plan.isFallback ? await getLastKnownPlan(orgId, plan) : plan;
    req.rateLimitPlanSlug = slug;

    // the null coalescing handles plans cached before a limit was added to them
    req.rateLimits = {
      ...DEFAULT_RATE_LIMITS,
      readLimit: rateLimits?.readLimit ?? DEFAULT_RATE_LIMITS.readLimit,
      writeLimit: rateLimits?.writeLimit ?? DEFAULT_RATE_LIMITS.writeLimit,
      secretsLimit: rateLimits?.secretsLimit ?? DEFAULT_RATE_LIMITS.secretsLimit
    };
  });
});
