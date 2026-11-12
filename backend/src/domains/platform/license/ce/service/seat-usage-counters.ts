import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { Meter } from "../model/meter";
import { TUsageCounter } from "./dependencies";

// Counted the same way as getSeatUsage.
export const seatUsageCounters = (organizationsProjectsService: TOrganizationsProjectsService): TUsageCounter[] => [
  {
    meter: Meter.Identities,
    count: async (orgId) => {
      const { users, identities } = await organizationsProjectsService.countBillableOrgActors(orgId);
      return users + identities;
    }
  },
  {
    meter: Meter.UserIdentities,
    count: async (orgId) => (await organizationsProjectsService.countBillableOrgActors(orgId)).users
  }
];
