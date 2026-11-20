import { TTransactionRunner } from "@app/domains/lib/transactions";

import { TOrganizationsProjectsStores } from "../dependencies";

// Each method locks the count until the caller's transaction ends and reads it on that transaction (the
// primary), so concurrent writers checking the same limit queue up and each sees the others' rows.
export type TOrganizationsProjectsTransaction = {
  // Same scope as countWorkspaces.
  lockAndCountWorkspaces(orgId: string): Promise<number>;
  // Counts the root org's tree for any org in it; null orgId = whole instance. Null when the org doesn't exist.
  lockAndCountBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number } | null>;
};

const CountLocks = {
  workspaces: (orgId: string) => `org-workspace-count:${orgId}`,
  billableActors: (rootOrgId: string | null) => `org-billable-actor-count:${rootOrgId ?? "instance"}`
};

export class OrganizationsProjectsTransaction implements TOrganizationsProjectsTransaction {
  constructor(private readonly transactionRunner: TTransactionRunner<TOrganizationsProjectsStores>) {}

  lockAndCountWorkspaces(orgId: string): Promise<number> {
    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.acquire(CountLocks.workspaces(orgId));
      return stores.organizationStore.countWorkspaces(orgId);
    });
  }

  lockAndCountBillableOrgActors(orgId: string | null) {
    return this.transactionRunner.run(async ({ stores }) => {
      const rootOrgId = orgId === null ? null : await stores.organizationStore.findRootOrgId(orgId);
      if (orgId !== null && rootOrgId === null) return null;
      await stores.locks.acquire(CountLocks.billableActors(rootOrgId));
      return stores.billableActorStore.countBillableOrgActors(rootOrgId);
    });
  }
}
