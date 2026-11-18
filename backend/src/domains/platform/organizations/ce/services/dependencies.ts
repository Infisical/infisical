import type { TActorOrg } from "@app/domains/lib/actor-context";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";

// projectId is null when the identity is org-owned.
export type TIdentityOwnership = { orgId: string; projectId: string | null; count: number };

export type TOrganization = { id: string; name: string; slug: string };

export type TOrganizationStore = {
  findRootOrgId(orgId: string, options?: TReadOptions): Promise<string | null>;
  findById(orgId: string, options?: TReadOptions): Promise<TOrganization | null>;
  // The org with its root org's sign-in policy, as a request acting in it needs. Null when it doesn't exist.
  findActorOrg(orgId: string, options?: TReadOptions): Promise<TActorOrg | null>;
};

// Null orgId = whole instance.
export type TBillableActorStore = {
  countBillableOrgActors(orgId: string | null, options?: TReadOptions): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null, options?: TReadOptions): Promise<TIdentityOwnership[]>;
};

export type TOrganizationsStores = {
  organizationStore: TOrganizationStore;
  billableActorStore: TBillableActorStore;
  locks: TStoreLocks;
};
