import type { TActorOrg } from "@app/domains/lib/actor-context";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";

// projectId is null when the identity is org-owned.
export type TIdentityOwnership = { orgId: string; projectId: string | null; count: number };

export type TOrganization = { id: string; name: string; slug: string };

// rootOrgId is null for a root org.
export type TOrganizationName = { id: string; name: string; rootOrgId: string | null };

// search matches name or slug, case-insensitively and literally.
export type TListRootOrganizationsQuery = { search?: string; limit: number; offset: number };

export type TOrganizationPage = { organizations: TOrganization[]; totalCount: number };

export type TOrganizationStore = {
  findRootOrgId(orgId: string, options?: TReadOptions): Promise<string | null>;
  findById(orgId: string, options?: TReadOptions): Promise<TOrganization | null>;
  // Includes the root org's sign-in policy.
  findActorOrg(orgId: string, options?: TReadOptions): Promise<TActorOrg | null>;
  // The org's root and every org under it, whichever org of the tree is given.
  listOrgTreeNames(orgId: string, options?: TReadOptions): Promise<TOrganizationName[]>;
  listAllOrgNames(options?: TReadOptions): Promise<TOrganizationName[]>;
  // Ordered by name.
  listRootOrganizations(query: TListRootOrganizationsQuery, options?: TReadOptions): Promise<TOrganizationPage>;
};

// Per process and short-lived, for actors the org's sign-in policy never applies to.
export type TActorOrgCache = {
  getOrLoad(orgId: string, load: () => Promise<TActorOrg | null>): Promise<TActorOrg | null>;
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
