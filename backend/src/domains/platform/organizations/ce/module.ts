import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import { TransactionRunner } from "@app/domains/lib/transactions";

import { BillableActorStore } from "./data-access/billable-actor-store";
import { OrganizationStore } from "./data-access/organization-store";
import { TOrganizationsStores } from "./services/dependencies";
import { OrganizationsService, TOrganizationsService } from "./services/organizations/service";

export type { TIdentityOwnership, TOrganization } from "./services/dependencies";
export type { TOrganizationsTransaction } from "./services/organizations/organizations-transaction";
export type { TOrganizationsService } from "./services/organizations/service";

export type TOrganizationsDeps = {
  db: TDbClient;
};

export class OrganizationsModule {
  readonly organizationsService: TOrganizationsService;

  constructor({ db }: TOrganizationsDeps) {
    const connection = poolStoreConnection(db);
    this.organizationsService = new OrganizationsService(
      new OrganizationStore(connection),
      new BillableActorStore(connection),
      new TransactionRunner<TOrganizationsStores>(db, (trx, locks) => ({
        organizationStore: new OrganizationStore(singleStoreConnection(trx)),
        billableActorStore: new BillableActorStore(singleStoreConnection(trx)),
        locks
      }))
    );
  }
}
