import { Knex } from "knex";
import { z } from "zod";

import { SecretType } from "@app/db/schemas";
import { defineEvent } from "@app/services/event-outbox/event-definition";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

// One event per shared secret per write, for create, update and delete alike: a consumer reacts to the
// secret having changed, and re-reads its current state (or finds it gone) to learn how. A move emits
// at both locations, since it deletes the secret at the source and writes it at the destination.
// Personal overrides belong to one user, not the project's shared state, so nothing is emitted for them.
export const SecretModifiedEventV1 = defineEvent({
  domain: "secrets",
  entity: "secret",
  action: "modified",
  version: 1,
  data: z.object({
    secretId: z.string().uuid(),
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1)
  })
});

// Where the written secrets live. Every low-level secret write takes one, so a caller cannot write
// secrets without saying where, and the emit cannot be skipped.
export type TSecretEventScope = {
  projectId: string;
  environment: string;
  secretPath: string;
};

export const secretModifiedEvents = (scope: TSecretEventScope, secrets: { id: string; type: string }[]) =>
  secrets
    .filter(({ type }) => type === SecretType.Shared)
    .map(({ id }) => SecretModifiedEventV1.build({ secretId: id, ...scope }));

export const emitSecretsModified = (
  eventEmitter: TEventEmitter,
  scope: TSecretEventScope,
  secrets: { id: string; type: string }[],
  tx?: Knex
): Promise<void> => eventEmitter.emitMany(secretModifiedEvents(scope, secrets), tx);
