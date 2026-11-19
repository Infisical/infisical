import fp from "fastify-plugin";

import { getConfig } from "@app/lib/config/env";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { DEFAULT_RATE_LIMITS } from "@app/server/config/rateLimiter";

export const injectRateLimits = fp(async (server) => {
  server.decorateRequest("rateLimits");
  server.addHook("onRequest", async (req) => {
    const { SECRETS_ORG_RATE_LIMIT_OFFSET, SECRETS_ACTOR_RATE_LIMIT_OFFSET } = getConfig();
    if (!req.auth?.orgId) {
      req.rateLimits = {
        ...DEFAULT_RATE_LIMITS,
        secretsOrgLimit: DEFAULT_RATE_LIMITS.secretsLimit + SECRETS_ORG_RATE_LIMIT_OFFSET,
        secretsActorLimit: DEFAULT_RATE_LIMITS.secretsLimit + SECRETS_ACTOR_RATE_LIMIT_OFFSET
      };
      return;
    }

    const { orgId } = req.auth;
    const { rateLimits } = await requestMemoize(requestMemoKeys.licensePlan(orgId), () =>
      server.services.licenseService.getPlan(orgId)
    );

    const secretsLimit = rateLimits?.secretsLimit ?? DEFAULT_RATE_LIMITS.secretsLimit;
    // the null coalescing handles plans cached before a limit was added to them
    req.rateLimits = {
      ...DEFAULT_RATE_LIMITS,
      readLimit: rateLimits?.readLimit ?? DEFAULT_RATE_LIMITS.readLimit,
      writeLimit: rateLimits?.writeLimit ?? DEFAULT_RATE_LIMITS.writeLimit,
      secretsLimit,
      secretsOrgLimit: rateLimits?.secretsOrgLimit ?? secretsLimit + SECRETS_ORG_RATE_LIMIT_OFFSET,
      secretsActorLimit: rateLimits?.secretsActorLimit ?? secretsLimit + SECRETS_ACTOR_RATE_LIMIT_OFFSET
    };
  });
});
