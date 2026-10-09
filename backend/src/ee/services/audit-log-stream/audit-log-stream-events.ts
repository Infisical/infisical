import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const AUDIT_LOG_STREAM_RESOURCE_TYPE = "audit-log.stream";
export const AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT = "audit-log.stream.delivery-failed";

export const AuditLogStreamDeliveryFailedPayloadSchema = z.object({
  provider: z.string(),
  errorMessage: z.string(),
  droppedCount: z.number().int().positive(),
  failingSince: z.coerce.date()
});

export type TAuditLogStreamDeliveryFailedInput = {
  orgId: string;
  streamId: string;
  provider: string | null;
  errorMessage: string;
  droppedCount: number;
  failingSince: Date;
};

export type TAuditLogStreamDeliveryFailedPayload = {
  orgId: string;
  projectId: null;
  resourceType: typeof AUDIT_LOG_STREAM_RESOURCE_TYPE;
  resourceId: string;
  targetIds: string[];
  provider: string;
  errorMessage: string;
  droppedCount: number;
  failingSince: string;
};

export const emitAuditLogStreamDeliveryFailed = (
  eventEmitter: TEventEmitter,
  { orgId, streamId, provider, errorMessage, droppedCount, failingSince }: TAuditLogStreamDeliveryFailedInput,
  tx: Knex
): Promise<void> => {
  const payload: TAuditLogStreamDeliveryFailedPayload = {
    orgId,
    projectId: null,
    resourceType: AUDIT_LOG_STREAM_RESOURCE_TYPE,
    resourceId: streamId,
    targetIds: [streamId],
    provider: provider ?? "unknown",
    errorMessage,
    droppedCount,
    failingSince: failingSince.toISOString()
  };

  return eventEmitter.emit({ eventType: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT, payload }, tx);
};
