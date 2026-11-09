import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";

// `rootOrgId` is set for sub-orgs. The org row is gone by the time consumers run, so the event carries
// what they need.
export const OrganizationModifiedEventV1 = defineEvent({
  domain: "organization",
  entity: "organization",
  action: "modified",
  version: 1,
  data: z.object({
    organizationId: z.string().uuid(),
    rootOrgId: z.string().uuid().nullable(),
    modificationType: z.nativeEnum(EventModificationType)
  })
});

export type TOrganizationModifiedEventData = z.infer<typeof OrganizationModifiedEventV1.data>;
