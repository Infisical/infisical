import { TDbClient } from "@app/db";

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

  constructor({ db }: TOrganizationsProjectsDeps) {
    this.service = new OrganizationsProjectsService({
      organizations: new OrganizationDataAccess(db),
      billableActors: new BillableActorDataAccess(db)
    });
  }
}
