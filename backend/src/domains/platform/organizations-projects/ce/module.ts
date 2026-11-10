import { TDbClient } from "@app/db";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";

import { OrganizationDataAccess } from "./data-access/organization-data-access";
import { BillableActorDataAccess } from "./data-access/usage-counter-data-access";
import { OrganizationsProjectsService, TOrganizationsProjectsService } from "./service/organizations-projects-service";

export type { TOrganizationsProjectsService } from "./service/organizations-projects-service";
export type { TIdentityOwnership, TOrganization } from "./service/dependencies";

export type TOrganizationsProjectsDeps = {
  db: TDbClient;
};

export class OrganizationsProjectsModule {
  readonly service: TOrganizationsProjectsService;

  readonly usageCounters: TUsageCounter[];

  constructor({ db }: TOrganizationsProjectsDeps) {
    const service = new OrganizationsProjectsService({
      organizations: new OrganizationDataAccess(db),
      billableActors: new BillableActorDataAccess(db)
    });
    this.service = service;
    this.usageCounters = [
      { meter: Meter.Identities, count: async (orgId) => (await service.countSeats(orgId)).identitiesUsed },
      { meter: Meter.UserIdentities, count: async (orgId) => (await service.countSeats(orgId)).membersUsed }
    ];
  }
}
