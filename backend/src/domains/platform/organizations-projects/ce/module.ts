import { TDbClient } from "@app/db";
import { TransactionRunner } from "@app/domains/lib/transaction-runner";

import { BillableActorDataAccess } from "./data-access/billable-actor-data-access";
import { OrganizationDataAccess } from "./data-access/organization-data-access";
import { TOrganizationsProjectsStore } from "./service/dependencies";
import { OrganizationsProjectsService, TOrganizationsProjectsService } from "./service/organizations-projects-service";

export type { TOrganizationsProjectsService } from "./service/organizations-projects-service";
export type { TOrganizationsProjectsTransaction } from "./service/organizations-projects-transaction";
export type { TIdentityOwnership, TOrganization } from "./service/dependencies";

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
