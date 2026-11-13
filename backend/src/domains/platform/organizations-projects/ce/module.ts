import { TDbClient } from "@app/db";
import { TransactionRunner } from "@app/domains/lib/transactions";

import { BillableActorStore } from "./data-access/billable-actor-store";
import { OrganizationStore } from "./data-access/organization-store";
import { TOrganizationsProjectsStores } from "./services/dependencies";
import { OrganizationsProjectsService, TOrganizationsProjectsService } from "./services/organizations-projects/service";

export type { TOrganizationsProjectsService } from "./services/organizations-projects/service";
export type { TOrganizationsProjectsTransaction } from "./services/organizations-projects/organizations-projects-transaction";
export type { TIdentityOwnership, TOrganization } from "./services/dependencies";

export type TOrganizationsProjectsDeps = {
  db: TDbClient;
};

export class OrganizationsProjectsModule {
  readonly organizationsProjectsService: TOrganizationsProjectsService;

  constructor({ db }: TOrganizationsProjectsDeps) {
    const replica = () => db.replicaNode();
    this.organizationsProjectsService = new OrganizationsProjectsService(
      new OrganizationStore(replica),
      new BillableActorStore(replica),
      new TransactionRunner<TOrganizationsProjectsStores>(db, (trx, locks) => ({
        organizationStore: new OrganizationStore(() => trx),
        billableActorStore: new BillableActorStore(() => trx),
        locks
      }))
    );
  }
}
