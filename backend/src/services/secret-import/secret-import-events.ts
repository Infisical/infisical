import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";

// `environment` and `secretPath` are the folder the import lives in (whose effective secrets change), not
// the folder it imports from. Imports never move, so there's no `previous`.
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
