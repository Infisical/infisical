import { z } from "zod";

import { defineEvent } from "@app/services/event-outbox/event-definition";

// Covers create, rename, move and delete. `secretPath` is the folder's own path at the time of the
// change. A rename or move emits once for the old path and once for the new one, because whatever
// covered the folder at either location (eg a sync on a parent folder) is affected. A deleted folder
// takes its subfolders with it, and those are not emitted separately: the event for the deleted folder
// covers everything beneath its path.
export const FolderModifiedEventV1 = defineEvent({
  domain: "secrets",
  entity: "folder",
  action: "modified",
  version: 1,
  data: z.object({
    folderId: z.string().uuid(),
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1)
  })
});
