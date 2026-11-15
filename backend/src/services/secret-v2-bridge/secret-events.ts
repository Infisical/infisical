import { Knex } from "knex";
import { z } from "zod";

import { SecretType } from "@app/db/schemas";
import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import {
  PreviousSecretLocationSchema,
  TPreviousSecretLocation
} from "@app/services/secret-folder/secret-folder-events";

// One event per shared secret per write; consumers re-read the secret to see what changed. A move between
// folders recreates the secret under a new id, so it's `deleted` at the source and `created` at the
// destination. A write that moves it in place (eg rotation moving its generated secrets) is one `updated`
// event with the old location in `previous`. Personal overrides belong to one user, so nothing is emitted
// for them.
export const SecretModifiedEventV1 = defineEvent({
  domain: "secrets",
  entity: "secret",
  action: "modified",
  version: 1,
  data: z.object({
    secretId: z.string().uuid(),
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1),
    modificationType: z.nativeEnum(EventModificationType),
    previous: PreviousSecretLocationSchema.optional()
  })
});

// Required on every low-level secret write so the emit can't be skipped.
export type TSecretEventScope = {
  projectId: string;
  environment: string;
  secretPath: string;
};

type TSecretModification = TSecretEventScope & {
  modificationType: EventModificationType;
  previous?: TPreviousSecretLocation;
};

export const secretModifiedEvents = (modification: TSecretModification, secrets: { id: string; type: string }[]) =>
  secrets
    .filter(({ type }) => type === SecretType.Shared)
    .map(({ id }) => SecretModifiedEventV1.build({ secretId: id, ...modification }));

export const emitSecretsModified = (
  eventEmitter: TEventEmitter,
  modification: TSecretModification,
  secrets: { id: string; type: string }[],
  tx?: Knex
): Promise<void> => eventEmitter.emit(secretModifiedEvents(modification, secrets), tx);
