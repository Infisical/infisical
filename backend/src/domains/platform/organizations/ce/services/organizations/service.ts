import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";

import {
  TBillableActorStore,
  TIdentityOwnership,
  TOrganization,
  TOrganizationStore,
  TOrganizationsStores
} from "../dependencies";
import { OrganizationsTransaction, TOrganizationsTransaction } from "./organizations-transaction";

// An org's root never changes, so cache it for the process. Capped so long-lived pods don't grow forever.
const ROOT_ORG_CACHE_LIMIT = 10_000;

export type TOrganizationsService = {
  // Null when the org doesn't exist.
  findRootOrgId(orgId: string): Promise<string | null>;
  // Falls back to the org itself when it doesn't exist.
  resolveRootOrgId(orgId: string): Promise<string>;
  // Not cached: name and slug can change.
  findOrganization(orgId: string): Promise<TOrganization | null>;
  // Org members in a Secret Manager/KMS project or in none. Null orgId = whole instance.
  countBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null): Promise<TIdentityOwnership[]>;
  // Joins the caller's transaction. Only for a limit check that must be atomic with the write it guards.
  within(tx: TTransaction): TOrganizationsTransaction;
};

export class OrganizationsService implements TOrganizationsService {
  private readonly rootOrgIds = new Map<string, string>();

  constructor(
    private readonly organizationStore: TOrganizationStore,
    private readonly billableActorStore: TBillableActorStore,
    private readonly transactionRunner: TTransactionRunner<TOrganizationsStores>
  ) {}

  async findRootOrgId(orgId: string): Promise<string | null> {
    const cached = this.rootOrgIds.get(orgId);
    if (cached) return cached;
    const root = await this.organizationStore.findRootOrgId(orgId);
    if (!root) return null;
    if (this.rootOrgIds.size >= ROOT_ORG_CACHE_LIMIT) {
      const oldest = this.rootOrgIds.keys().next().value;
      if (oldest !== undefined) this.rootOrgIds.delete(oldest);
    }
    this.rootOrgIds.set(orgId, root);
    return root;
  }

  async resolveRootOrgId(orgId: string): Promise<string> {
    return (await this.findRootOrgId(orgId)) ?? orgId;
  }

  findOrganization(orgId: string): Promise<TOrganization | null> {
    return this.organizationStore.findById(orgId);
  }

  countBillableOrgActors(orgId: string | null) {
    return this.billableActorStore.countBillableOrgActors(orgId);
  }

  getBillableIdentityOwnershipBreakdown(orgId: string | null) {
    return this.billableActorStore.getBillableIdentityOwnershipBreakdown(orgId);
  }

  within(tx: TTransaction): TOrganizationsTransaction {
    return new OrganizationsTransaction(this.transactionRunner.within(tx));
  }
}
