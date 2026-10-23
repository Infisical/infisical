import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";

// Where an entity was before an update moved it. Only the fields that changed are present.
export const PreviousSecretLocationSchema = z.object({
  environment: z.string().min(1).optional(),
  secretPath: z.string().min(1).optional()
});

export type TPreviousSecretLocation = z.infer<typeof PreviousSecretLocationSchema>;

type TSecretLocation = { environment: string; secretPath: string };

// Undefined when the update left the location alone, so `previous` only appears on an update that moved.
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

// `secretPath` is the folder's own path, after the change for `created` and `updated` and before it for
// `deleted`. A rename is one `updated` event whose `previous` holds the old path, so a consumer covering
// either path hears about it. A move to another parent recreates the folder and its subfolders under new
// ids, so it is `created` at the destination and `deleted` at the source. A deleted folder takes its
// subfolders with it, and those are not emitted separately: the event covers everything beneath its path.
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
