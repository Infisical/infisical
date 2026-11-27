import { TTransactionRunner } from "@app/domains/lib/transactions";

import { TProjectsStores } from "../dependencies";

// Lock is held until the caller's tx ends and the count reads on that tx (primary), so concurrent writers checking
// the same limit queue up and each sees the others' rows.
export type TProjectsTransaction = {
  // Same scope as countWorkspaces (sub-orgs included).
  lockAndCountWorkspaces(orgId: string): Promise<number>;
};

const CountLocks = {
  workspaces: (orgId: string) => `org-workspace-count:${orgId}`
};

export class ProjectsTransaction implements TProjectsTransaction {
  constructor(private readonly transactionRunner: TTransactionRunner<TProjectsStores>) {}

  lockAndCountWorkspaces(orgId: string): Promise<number> {
    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.acquire(CountLocks.workspaces(orgId));
      return stores.projectStore.countWorkspaces(orgId);
    });
  }
}
