import { z } from "zod";

import { defineEvent, EventModificationType } from "@app/services/event-outbox/event-definition";

// `rootOrgId` is set for a sub-organization. A deleted organization leaves no row to read, so the
// event carries everything a consumer needs to act.
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
