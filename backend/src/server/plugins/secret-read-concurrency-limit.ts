import { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import {
  createKeyedConcurrencyLimiter,
  TConcurrencySlot,
  TKeyedRefusal
} from "@app/lib/concurrency/concurrency-limiter";
import { getConfig } from "@app/lib/config/env";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

const REFUSAL_LOG_INTERVAL_MS = 10_000;

const REFUSAL_MESSAGES: Record<TKeyedRefusal["scope"], string> = {
  key: "Your organization has too many secret list requests in progress. Please try again in a second",
  instance: "Infisical is handling too many secret list requests right now. Please try again in a second"
};

const unlimitedSlot: TConcurrencySlot = (work) => work();

export const secretReadConcurrencyLimit = fp(async (server) => {
  const appCfg = getConfig();
  if (!appCfg.SECRET_READ_CONCURRENCY_LIMIT_ENABLED) {
    server.decorate("secretReadSlot", () => unlimitedSlot);
    return;
  }

  const limiter = createKeyedConcurrencyLimiter({
    perKeyLimit: appCfg.SECRET_READ_MAX_IN_FLIGHT_PER_ORG,
    globalLimit: appCfg.SECRET_READ_MAX_IN_FLIGHT,
    maxWaitMs: appCfg.SECRET_READ_MAX_QUEUE_WAIT_MS,
    maxQueueDepth: appCfg.SECRET_READ_MAX_QUEUE_DEPTH,
    maxTrackedKeys: appCfg.SECRET_READ_MAX_TRACKED_ORGS,
    maxTotalInFlight: appCfg.SECRET_READ_MAX_TOTAL_IN_FLIGHT
  });

  const lastRefusalLogAt: Record<TKeyedRefusal["scope"], number> = { key: 0, instance: 0 };

  const logRefusal = (orgId: string, { scope, reason }: TKeyedRefusal) => {
    if (Date.now() - lastRefusalLogAt[scope] <= REFUSAL_LOG_INTERVAL_MS) return;
    lastRefusalLogAt[scope] = Date.now();
    logger.warn(
      `secretReadConcurrencyLimit: refused a secret list request [orgId=${orgId}] [scope=${scope}] [reason=${reason}] [orgQueueDepth=${limiter.getKeyQueueDepth(orgId)}] [instanceQueueDepth=${limiter.getGlobalQueueDepth()}] [totalInFlight=${limiter.getTotalInFlight()}]`
    );
  };

  server.decorate("secretReadSlot", (req: FastifyRequest, reply: FastifyReply): TConcurrencySlot => {
    const orgId = req.auth?.rootOrgId;
    if (!orgId) return unlimitedSlot;

    return async (work) => {
      const admission = await limiter.tryRun(orgId, work);
      if (admission.admitted) return admission.value;

      logRefusal(orgId, admission);
      void reply.header("Retry-After", 1);
      throw new RateLimitError({ message: REFUSAL_MESSAGES[admission.scope] });
    };
  });
});
