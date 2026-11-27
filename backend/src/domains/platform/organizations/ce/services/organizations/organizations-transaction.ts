import { TTransactionRunner } from "@app/domains/lib/transactions";

import { TOrganizationsStores } from "../dependencies";

// Locks the count until the caller's tx ends and reads on that tx (primary), so concurrent writers on the same
// limit queue up and see each other's rows.
export type TOrganizationsTransaction = {
  // Counts the root org's tree for any org in it; null orgId = whole instance. Null when the org doesn't exist.
  lockAndCountBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number } | null>;
};

const CountLocks = {
  billableActors: (rootOrgId: string | null) => `org-billable-actor-count:${rootOrgId ?? "instance"}`
};

export class OrganizationsTransaction implements TOrganizationsTransaction {
  constructor(private readonly transactionRunner: TTransactionRunner<TOrganizationsStores>) {}

  lockAndCountBillableOrgActors(orgId: string | null) {
    return this.transactionRunner.run(async ({ stores }) => {
      const rootOrgId = orgId === null ? null : await stores.organizationStore.findRootOrgId(orgId);
      if (orgId !== null && rootOrgId === null) return null;
      await stores.locks.acquire(CountLocks.billableActors(rootOrgId));
      return stores.billableActorStore.countBillableOrgActors(rootOrgId);
    });
  }
}
