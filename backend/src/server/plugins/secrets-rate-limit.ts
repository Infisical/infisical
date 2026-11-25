import { FastifyReply } from "fastify";
import fp from "fastify-plugin";

import { getConfig } from "@app/lib/config/env";
import { RateLimitError } from "@app/lib/errors";
import { secretsLimit } from "@app/server/config/rateLimiter";
import { ActorType } from "@app/services/auth/auth-type";

const actorSubject = (type: ActorType) => {
  if (type === ActorType.USER) return "You have";
  if (type === ActorType.IDENTITY) return "This machine identity has";
  if (type === ActorType.SERVICE) return "This service token has";
  return "This credential has";
};

const refuse = (reply: FastifyReply, subject: string, limit: { max: number; ttlInSeconds: number }): never => {
  void reply.header("Retry-After", limit.ttlInSeconds);
  throw new RateLimitError({
    message: `${subject} made more than ${limit.max} secret requests in the last minute. Please try again in ${limit.ttlInSeconds} seconds`
  });
};

export const secretsRateLimit = fp(async (server) => {
  if (!getConfig().SECRETS_RATE_LIMIT_ENABLED || !server.hasDecorator("createRateLimit")) return;

  const checkActorLimit = server.createRateLimit({
    timeWindow: 60 * 1000,
    max: (req) => req.rateLimits.secretsActorLimit,
    keyGenerator: (req) => `secrets-actor:${req.auth?.rootOrgId}:${req.permission.type}:${req.permission.id}`
  });

  server.addHook("preHandler", async (req, reply) => {
    if (req.routeOptions.config.rateLimit !== secretsLimit || !req.auth?.rootOrgId || !req.permission?.id) return;

    const actorLimit = await checkActorLimit(req);
    if (!actorLimit.isAllowed && actorLimit.isExceeded) {
      refuse(reply, actorSubject(req.permission.type), actorLimit);
    }
  });
});
