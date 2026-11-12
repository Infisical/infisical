import { TTransactionRunner } from "@app/domains/lib/transaction-runner";

import { TOrganizationsProjectsStore } from "./dependencies";

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
  constructor(private readonly runner: TTransactionRunner<TOrganizationsProjectsStore>) {}

  lockAndCountWorkspaces(orgId: string): Promise<number> {
    return this.runner.run(async ({ store }) => {
      await store.locks.acquire(CountLocks.workspaces(orgId));
      return store.organizations.countWorkspaces(orgId);
    });
  }

  lockAndCountBillableOrgActors(orgId: string | null) {
    return this.runner.run(async ({ store }) => {
      const rootOrgId = orgId === null ? null : await store.organizations.findRootOrgId(orgId);
      if (orgId !== null && rootOrgId === null) return null;
      await store.locks.acquire(CountLocks.billableActors(rootOrgId));
      return store.billableActors.countBillableOrgActors(rootOrgId);
    });
  }
}
