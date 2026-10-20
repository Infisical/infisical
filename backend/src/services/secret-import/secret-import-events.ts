import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";

// Covers create, update and delete of an import. `environment` and `secretPath` locate the folder the
// import lives in, which is the folder whose effective secrets change, not the folder it imports from.
// An import never moves to another folder, so unlike secrets and folders it has no `previous`.
export const SecretImportModifiedEventV1 = defineEvent({
  domain: "secrets",
  entity: "secret-import",
  action: "modified",
  version: 1,
  data: z.object({
    secretImportId: z.string().uuid(),
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1),
    modificationType: z.nativeEnum(EventModificationType)
  })
});
