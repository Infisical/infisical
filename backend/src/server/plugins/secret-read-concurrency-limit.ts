import fp from "fastify-plugin";

import { createKeyedConcurrencyLimiter } from "@app/lib/concurrency/concurrency-limiter";
import { getConfig } from "@app/lib/config/env";
import { RateLimitError } from "@app/lib/errors";

// Listing a large folder holds the event loop for hundreds of milliseconds, so a burst of them from one
// organization delays every other organization's requests on the instance. A per-minute rate limit lets
// that whole burst through in the first second, so these routes are also limited by how many run at once.
// The handler is wrapped rather than gated in a hook so the slot is held until the work ends, even when the
// client disconnects first.
export const secretReadConcurrencyLimit = fp(async (server) => {
  const appCfg = getConfig();
  if (!appCfg.SECRET_READ_CONCURRENCY_LIMIT_ENABLED) return;

  const limiter = createKeyedConcurrencyLimiter({
    perKeyLimit: appCfg.SECRET_READ_MAX_IN_FLIGHT_PER_ORG,
    globalLimit: appCfg.SECRET_READ_MAX_IN_FLIGHT,
    maxWaitMs: appCfg.SECRET_READ_MAX_QUEUE_WAIT_MS,
    maxQueueDepth: appCfg.SECRET_READ_MAX_QUEUE_DEPTH,
    maxTrackedKeys: 10_000,
    maxTotalInFlight: 10_000
  });

  server.addHook("onRoute", (route) => {
    if (!route.config?.limitSecretReadConcurrency) return;

    const { handler } = route;
    // eslint-disable-next-line no-param-reassign
    route.handler = async function limitedSecretRead(req, reply) {
      const orgId = req.auth?.rootOrgId;
      if (!orgId) return handler.call(this, req, reply);

      let admitted = false;
      const result = await limiter.run(orgId, async () => {
        admitted = true;
        return handler.call(this, req, reply);
      });

      if (!admitted) {
        void reply.header("Retry-After", 1);
        throw new RateLimitError({
          message: "Your organization has too many secret list requests in progress. Please try again in a second"
        });
      }
      return result;
    };
  });
});
