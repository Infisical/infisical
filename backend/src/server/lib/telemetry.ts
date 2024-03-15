import { FastifyRequest } from "fastify";

import { ActorType } from "@app/services/auth/auth-type";

// this is a unique id for sending posthog event
export const getTelemetryDistinctId = (req: FastifyRequest) => {
  if (req.auth.actor === ActorType.USER) {
    return req.auth.user.username;
  }
  if (req.auth.actor === ActorType.IDENTITY) {
    return `identity-${req.auth.identityId}`;
  }
  if (req.auth.actor === ActorType.SERVICE) {
    return req.auth.serviceToken.createdByEmail || `service-token-null-creator-${req.auth.serviceTokenId}`; // when user gets removed from system
  }
  return "unknown-auth-data";
};
