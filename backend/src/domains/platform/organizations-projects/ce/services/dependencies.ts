import { ProjectType } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";

// projectId is null when the identity is org-owned.
export type TIdentityOwnership = { orgId: string; projectId: string | null; count: number };

export type TOrganization = { id: string; name: string; slug: string };

export type TOrganizationStore = {
  findRootOrgId(orgId: string, options?: TReadOptions): Promise<string | null>;
  findById(orgId: string, options?: TReadOptions): Promise<TOrganization | null>;
  countWorkspaces(orgId: string, options?: TReadOptions): Promise<number>;
};

// Null orgId = whole instance.
export type TBillableActorStore = {
  countBillableOrgActors(orgId: string | null, options?: TReadOptions): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null, options?: TReadOptions): Promise<TIdentityOwnership[]>;
  countProjectIdentities(projectType: ProjectType, orgId: string | null, options?: TReadOptions): Promise<number>;
  countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<{ users: number; identities: number }>;
  getProjectIdentityOwnershipBreakdown(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<TIdentityOwnership[]>;
};

export type TOrganizationsProjectsStores = {
  organizationStore: TOrganizationStore;
  billableActorStore: TBillableActorStore;
  locks: TStoreLocks;
};
