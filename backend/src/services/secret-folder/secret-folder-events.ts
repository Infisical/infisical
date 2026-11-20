import { Knex } from "knex";
import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

// Where an entity was before an update moved it. Only the fields that changed are present.
export const PreviousSecretLocationSchema = z.object({
  environment: z.string().min(1).optional(),
  secretPath: z.string().min(1).optional()
});

export type TPreviousSecretLocation = z.infer<typeof PreviousSecretLocationSchema>;

type TSecretLocation = { environment: string; secretPath: string };

// Undefined when nothing changed, so `previous` only shows up on a move.
export const previousSecretLocation = (
  before: TSecretLocation,
  after: TSecretLocation
): TPreviousSecretLocation | undefined => {
  const previous: TPreviousSecretLocation = {
    ...(before.environment !== after.environment && { environment: before.environment }),
    ...(before.secretPath !== after.secretPath && { secretPath: before.secretPath })
  };
  return Object.keys(previous).length ? previous : undefined;
};

// `secretPath` is the folder's own path: the new one for `created` and `updated`, the old one for `deleted`.
// A rename is one `updated` event with the old path in `previous`. A move to another parent recreates the
// folder and its subfolders under new ids, so it's `created` at the destination and `deleted` at the source.
// Deleting a folder emits one event that covers everything beneath it; subfolders are not emitted separately.
export const FolderModifiedEventV1 = defineEvent({
  domain: "secrets",
  entity: "folder",
  action: "modified",
  version: 1,
  data: z.object({
    folderId: z.string().uuid(),
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1),
    modificationType: z.nativeEnum(EventModificationType),
    previous: PreviousSecretLocationSchema.optional()
  })
});

export const emitFoldersModified = (
  eventEmitter: TEventEmitter,
  modification: { projectId: string; environment: string; modificationType: EventModificationType },
  folders: { folderId: string; secretPath: string }[],
  tx?: Knex
): Promise<void> =>
  eventEmitter.emit(
    folders.map((folder) => FolderModifiedEventV1.build({ ...folder, ...modification })),
    tx
  );
