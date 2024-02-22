import { FastifyRequest } from "fastify";

import { ActorType } from "@app/services/auth/auth-type";

// this is a unique id for sending posthog event
export const getTelemetryDistinctId = (req: FastifyRequest) => {
  if (req.auth.actor === ActorType.USER) {
    return req.auth.user.email;
  }
  if (req.auth.actor === ActorType.IDENTITY) {
    return `identity-${req.auth.identityId}`;
  }
  if (req.auth.actor === ActorType.SERVICE) {
    return `service-token-${req.auth.serviceToken.id}`;
  }
  return "unknown-auth-data";
};
