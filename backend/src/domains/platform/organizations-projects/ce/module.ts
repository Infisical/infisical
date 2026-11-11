import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";

import { OrganizationDataAccess } from "./data-access/organization-data-access";
import { BillableActorDataAccess } from "./data-access/usage-counter-data-access";
import { OrganizationsProjectsService, TOrganizationsProjectsService } from "./service/organizations-projects-service";

export type { TOrganizationsProjectsService } from "./service/organizations-projects-service";
export type { TIdentityOwnership, TOrganization } from "./service/dependencies";

export type TOrganizationsProjectsDeps = {
  db: DataAccessDb;
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
      {
        meter: Meter.Identities,
        count: async (orgId) => {
          const seats = await service.countSeats(orgId);
          return seats.identitiesUsed;
        }
      },
      {
        meter: Meter.UserIdentities,
        count: async (orgId) => {
          const seats = await service.countSeats(orgId);
          return seats.membersUsed;
        }
      }
    ];
  }
}
