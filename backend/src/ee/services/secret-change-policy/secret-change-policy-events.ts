import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";

const SecretChangePolicyScopeSchema = z.object({
  environmentIds: z.array(z.string().uuid()),
  secretPath: z.string(),
  enforceImportReplication: z.boolean()
});

// `previous` holds only the scope fields an update changed. A consumer that cares about which folders a policy
// governs reads both, because a policy that stops governing a folder can hand it to a broader policy.
export const SecretChangePolicyModifiedEventV1 = defineEvent({
  domain: "secrets",
  entity: "secret-change-policy",
  action: "modified",
  version: 1,
  data: SecretChangePolicyScopeSchema.extend({
    policyId: z.string().uuid(),
    projectId: z.string().min(1),
    modificationType: z.nativeEnum(EventModificationType),
    previous: SecretChangePolicyScopeSchema.partial().optional()
  })
});

export type TSecretChangePolicyModifiedEventData = z.infer<typeof SecretChangePolicyModifiedEventV1.data>;
