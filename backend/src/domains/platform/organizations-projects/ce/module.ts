import { TDbClient } from "@app/db";
import { TransactionRunner } from "@app/domains/lib/transaction-runner";

import { BillableActorDataAccess } from "./data-access/billable-actor-data-access";
import { OrganizationDataAccess } from "./data-access/organization-data-access";
import { TOrganizationsProjectsStore } from "./services/dependencies";
import { OrganizationsProjectsService, TOrganizationsProjectsService } from "./services/organizations-projects/service";

export type { TOrganizationsProjectsService } from "./services/organizations-projects/service";
export type { TOrganizationsProjectsTransaction } from "./services/organizations-projects/organizations-projects-transaction";
export type { TIdentityOwnership, TOrganization } from "./services/dependencies";

export type TOrganizationsProjectsDeps = {
  db: TDbClient;
};

export class OrganizationsProjectsModule {
  readonly service: TOrganizationsProjectsService;

  constructor({ db }: TOrganizationsProjectsDeps) {
    const replica = () => db.replicaNode();
    this.service = new OrganizationsProjectsService({
      organizations: new OrganizationDataAccess(replica),
      billableActors: new BillableActorDataAccess(replica),
      runner: new TransactionRunner<TOrganizationsProjectsStore>(db, (trx, locks) => ({
        organizations: new OrganizationDataAccess(() => trx),
        billableActors: new BillableActorDataAccess(() => trx),
        locks
      }))
    });
  }
}
