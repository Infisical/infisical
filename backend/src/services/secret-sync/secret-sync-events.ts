import crypto from "node:crypto";

import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

import { SecretSyncAction } from "./secret-sync-types";

export const SECRET_SYNC_RESOURCE_TYPE = "secret.sync";
export const SECRET_SYNC_FAILED_EVENT = "secret.sync.failed";

// Keeps a provider's error text well inside the outbox's payload limit.
const MAX_FAILURE_MESSAGE_LENGTH = 2000;

export const SecretSyncFailedPayloadSchema = z.object({
  action: z.nativeEnum(SecretSyncAction),
  failureMessage: z.string().nullish(),
  attemptedAt: z.coerce.date()
});

type TSecretSyncFailedInput = {
  orgId: string;
  projectId: string;
  syncId: string;
  action: SecretSyncAction;
  failureMessage?: string | null;
  attemptedAt: Date;
};

export const emitSecretSyncFailed = (
  eventEmitter: TEventEmitter,
  { orgId, projectId, syncId, action, failureMessage, attemptedAt }: TSecretSyncFailedInput,
  tx?: Knex
): Promise<void> =>
  eventEmitter.emit(
    [
      {
        id: crypto.randomUUID(),
        type: SECRET_SYNC_FAILED_EVENT,
        data: {
          orgId,
          projectId,
          resourceType: SECRET_SYNC_RESOURCE_TYPE,
          resourceId: syncId,
          targetIds: [syncId],
          action,
          failureMessage: failureMessage ? failureMessage.slice(0, MAX_FAILURE_MESSAGE_LENGTH) : null,
          attemptedAt: attemptedAt.toISOString()
        }
      }
    ],
    tx
  );
