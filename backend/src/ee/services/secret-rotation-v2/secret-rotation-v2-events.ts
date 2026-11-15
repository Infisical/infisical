import crypto from "node:crypto";

import { Knex } from "knex";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const SECRET_ROTATION_RESOURCE_TYPE = "secret.rotation";
export const SECRET_ROTATION_FAILED_EVENT = "secret.rotation.failed";

export const SecretRotationFailedPayloadSchema = z.object({
  attemptedAt: z.coerce.date()
});

type TSecretRotationFailedInput = {
  orgId: string;
  projectId: string;
  rotationId: string;
  attemptedAt: Date;
};

export const emitSecretRotationFailed = (
  eventEmitter: TEventEmitter,
  { orgId, projectId, rotationId, attemptedAt }: TSecretRotationFailedInput,
  tx: Knex
): Promise<void> =>
  eventEmitter.emit(
    [
      {
        id: crypto.randomUUID(),
        type: SECRET_ROTATION_FAILED_EVENT,
        data: {
          orgId,
          projectId,
          resourceType: SECRET_ROTATION_RESOURCE_TYPE,
          resourceId: rotationId,
          targetIds: [rotationId],
          attemptedAt: attemptedAt.toISOString()
        }
      }
    ],
    tx
  );
