import { FastifyRequest } from "fastify";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TAgentVaultActorPostHogEvent, TPostHogEvent } from "@app/services/telemetry/telemetry-types";

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

type TAgentVaultEventInput<T extends TAgentVaultActorPostHogEvent = TAgentVaultActorPostHogEvent> = T extends {
  event: infer E;
  properties: infer P;
}
  ? { event: E; properties: Omit<P, "orgId" | "channel" | "actorType"> }
  : never;

export const emitAgentVaultTelemetry = (
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">,
  req: FastifyRequest & { permission: { orgId: string; type: ActorType } },
  event: TAgentVaultEventInput
) => {
  const payload = {
    event: event.event,
    distinctId: getTelemetryDistinctId(req),
    organizationId: req.permission.orgId,
    properties: {
      ...event.properties,
      orgId: req.permission.orgId,
      channel: req.auditLogInfo.userAgentType ?? UserAgentType.OTHER,
      actorType: req.permission.type
    }
  } as TPostHogEvent;

  void telemetryService.sendPostHogEvents(payload).catch(() => {});
};
