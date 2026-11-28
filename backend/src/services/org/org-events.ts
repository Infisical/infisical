import { z } from "zod";

import { EventDefinition, EventModificationType } from "@app/domains/platform/events/ce/module";

// The org row is gone by the time consumers run, so carry what they need. rootOrgId is set for sub-orgs.
export const OrganizationModifiedEventV1 = EventDefinition.define({
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
