import { TTransactionRunner } from "@app/domains/lib/transactions";

import { TProjectsStores } from "../dependencies";

// Locks the count until the caller's transaction ends and reads it on that transaction (the primary), so concurrent
// writers checking the same limit queue up and each sees the others' rows.
export type TProjectsTransaction = {
  // Same scope as countWorkspaces.
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
