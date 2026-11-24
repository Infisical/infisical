import crypto from "node:crypto";

import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const GATEWAY_RESOURCE_TYPE = "gateway";
export const GATEWAY_OFFLINE_EVENT = "gateway.offline";

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
