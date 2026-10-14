import fp from "fastify-plugin";

import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { DEFAULT_RATE_LIMITS } from "@app/server/config/rateLimiter";

export const injectRateLimits = fp(async (server) => {
  server.decorateRequest("rateLimits");
  server.addHook("onRequest", async (req) => {
    if (!req.auth?.orgId) {
      req.rateLimits = DEFAULT_RATE_LIMITS;
      return;
    }

    const { orgId } = req.auth;
    const { rateLimits } = await requestMemoize(requestMemoKeys.licensePlan(orgId), () =>
      server.services.license.getPlan(orgId)
    );

    // the null coalescing handles plans cached before a limit was added to them
    req.rateLimits = {
      ...DEFAULT_RATE_LIMITS,
      readLimit: rateLimits?.readLimit ?? DEFAULT_RATE_LIMITS.readLimit,
      writeLimit: rateLimits?.writeLimit ?? DEFAULT_RATE_LIMITS.writeLimit,
      secretsLimit: rateLimits?.secretsLimit ?? DEFAULT_RATE_LIMITS.secretsLimit
    };
  });
});
