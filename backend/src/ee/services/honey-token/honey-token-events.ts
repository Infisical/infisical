import crypto from "node:crypto";

import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const HONEY_TOKEN_RESOURCE_TYPE = "secret.honey-token";
export const HONEY_TOKEN_TRIGGERED_EVENT = "secret.honey-token.triggered";

// The trigger metadata comes from the provider's event stream, so each field is capped at emit: an oversized
// value would fail the outbox insert and, with it, the transaction that marks the token triggered.
const MAX_TRIGGER_FIELD_LENGTH = 256;

export const HoneyTokenTriggeredPayloadSchema = z.object({
  triggeredAt: z.coerce.date(),
  eventName: z.string(),
  eventTime: z.string(),
  sourceIp: z.string().nullable(),
  awsRegion: z.string().nullable()
});

type THoneyTokenTriggeredInput = {
  orgId: string;
  projectId: string;
  honeyTokenId: string;
  triggeredAt: Date;
  eventName: string;
  eventTime: string;
  sourceIp?: string | null;
  awsRegion?: string | null;
};

const capField = (value: string) => value.slice(0, MAX_TRIGGER_FIELD_LENGTH);

export const emitHoneyTokenTriggered = (
  eventEmitter: TEventEmitter,
  { orgId, projectId, honeyTokenId, triggeredAt, eventName, eventTime, sourceIp, awsRegion }: THoneyTokenTriggeredInput,
  tx: Knex
): Promise<void> =>
  eventEmitter.emit(
    [
      {
        id: crypto.randomUUID(),
        type: HONEY_TOKEN_TRIGGERED_EVENT,
        data: {
          orgId,
          projectId,
          resourceType: HONEY_TOKEN_RESOURCE_TYPE,
          resourceId: honeyTokenId,
          targetIds: [honeyTokenId],
          triggeredAt: triggeredAt.toISOString(),
          eventName: capField(eventName),
          eventTime: capField(eventTime),
          sourceIp: sourceIp ? capField(sourceIp) : null,
          awsRegion: awsRegion ? capField(awsRegion) : null
        }
      }
    ],
    tx
  );
