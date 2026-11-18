import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import { TransactionRunner } from "@app/domains/lib/transactions";

import { ProjectIdentityStore } from "./data-access/project-identity-store";
import { ProjectStore } from "./data-access/project-store";
import { TProjectsStores } from "./services/dependencies";
import { ProjectsService, TProjectsService } from "./services/projects/service";

export type { TProjectsTransaction } from "./services/projects/projects-transaction";
export type { TProjectsService } from "./services/projects/service";

export type TProjectsDeps = {
  db: TDbClient;
};

export class ProjectsModule {
  readonly projectsService: TProjectsService;

  constructor({ db }: TProjectsDeps) {
    const connection = poolStoreConnection(db);
    this.projectsService = new ProjectsService(
      new ProjectStore(connection),
      new ProjectIdentityStore(connection),
      new TransactionRunner<TProjectsStores>(db, (trx, locks) => ({
        projectStore: new ProjectStore(singleStoreConnection(trx)),
        projectIdentityStore: new ProjectIdentityStore(singleStoreConnection(trx)),
        locks
      }))
    );
  }
}
