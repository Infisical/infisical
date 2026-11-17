import { ProjectType } from "@app/db/schemas";
import { TStoreLocks } from "@app/domains/lib/transactions";

// projectId is null when the identity is org-owned.
export type TIdentityOwnership = { orgId: string; projectId: string | null; count: number };

export type TOrganization = { id: string; name: string; slug: string };

export type TOrganizationStore = {
  findRootOrgId(orgId: string): Promise<string | null>;
  findById(orgId: string): Promise<TOrganization | null>;
  countWorkspaces(orgId: string): Promise<number>;
};

// Null orgId = whole instance.
export type TBillableActorStore = {
  countBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null): Promise<TIdentityOwnership[]>;
  countProjectIdentities(projectType: ProjectType, orgId: string | null): Promise<number>;
  countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string
  ): Promise<{ users: number; identities: number }>;
  getProjectIdentityOwnershipBreakdown(projectType: ProjectType, orgId?: string): Promise<TIdentityOwnership[]>;
};

export type TOrganizationsProjectsStores = {
  organizationStore: TOrganizationStore;
  billableActorStore: TBillableActorStore;
  locks: TStoreLocks;
};
