import crypto from "node:crypto";

import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/lib/knex/event-emitter";
import { PAGERDUTY_MAX_INCIDENTS_PER_RUN } from "@app/services/alert/channels/alert-channel-pagerduty-fns";

export const GATEWAY_RESOURCE_TYPE = "networking.gateway";
export const GATEWAY_OFFLINE_EVENT = "networking.gateway.offline";

// The engine drops event targets past a channel's per-run cap instead of deferring them, and a claimed
// gateway is not alerted again this outage, so no event may name more gateways than PagerDuty takes.
export const GATEWAY_OFFLINE_BATCH_SIZE = PAGERDUTY_MAX_INCIDENTS_PER_RUN;

export const GatewayOfflinePayloadSchema = z.object({
  gateways: z
    .array(
      z.object({
        id: z.string().uuid(),
        lastSeenAt: z.coerce.date()
      })
    )
    .min(1)
});

export type TGatewayOfflineInput = {
  orgId: string;
  gateways: { id: string; lastSeenAt: Date }[];
};

export type TGatewayOfflinePayload = {
  orgId: string;
  projectId: null;
  resourceType: typeof GATEWAY_RESOURCE_TYPE;
  resourceId: null;
  targetIds: string[];
  gateways: { id: string; lastSeenAt: string }[];
};

export const emitGatewayOffline = (
  eventEmitter: TEventEmitter,
  { orgId, gateways }: TGatewayOfflineInput,
  tx: Knex
): Promise<void> => {
  const payload: TGatewayOfflinePayload = {
    orgId,
    projectId: null,
    resourceType: GATEWAY_RESOURCE_TYPE,
    resourceId: null,
    targetIds: gateways.map((gateway) => gateway.id),
    gateways: gateways.map((gateway) => ({ id: gateway.id, lastSeenAt: gateway.lastSeenAt.toISOString() }))
  };

  return eventEmitter.emit([{ id: crypto.randomUUID(), type: GATEWAY_OFFLINE_EVENT, data: payload }], tx);
};
