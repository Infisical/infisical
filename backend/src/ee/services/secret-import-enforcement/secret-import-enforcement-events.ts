import { z } from "zod";

import { defineEvent } from "@app/services/event-outbox/event-definition";

// One existing regular import a secret change policy change brought under "Require approval for imported
// secrets". `environment` and `secretPath` are the folder the import lives in.
export const SecretImportReplicationConversionRequestedEventV1 = defineEvent({
  domain: "secrets",
  entity: "secret-import",
  action: "replication-conversion-requested",
  version: 1,
  data: z.object({
    secretImportId: z.string().uuid(),
    secretChangePolicyId: z.string().uuid(),
    secretChangePolicyName: z.string(),
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1)
  })
});

export type TSecretImportReplicationConversionRequestedEventData = z.infer<
  typeof SecretImportReplicationConversionRequestedEventV1.data
>;
