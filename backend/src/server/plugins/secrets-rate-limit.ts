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

  const checkOrgLimit = server.createRateLimit({
    timeWindow: 60 * 1000,
    max: (req) => req.rateLimits.secretsOrgLimit,
    keyGenerator: (req) => `secrets-org:${req.auth?.rootOrgId}`
  });

  server.addHook("preHandler", async (req, reply) => {
    if (req.routeOptions.config.rateLimit !== secretsLimit || !req.auth?.rootOrgId) return;

    // An allowed request counts toward both limits. The actor is checked first so that a request the
    // actor limit refuses never reaches the organization check, which would count it there too.
    if (req.permission?.id) {
      const actorLimit = await checkActorLimit(req);
      if (!actorLimit.isAllowed && actorLimit.isExceeded) {
        refuse(reply, actorSubject(req.permission.type), actorLimit);
      }
    }

    const orgLimit = await checkOrgLimit(req);
    if (!orgLimit.isAllowed && orgLimit.isExceeded) {
      refuse(reply, "Your organization has", orgLimit);
    }
  });
});
