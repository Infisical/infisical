import { ProjectType } from "@app/db/schemas";

// Machine identities from one metered set, attributed to where each was created: the project that owns it, or
// the org itself (projectId null) when it is org-owned.
export type TIdentityOwnership = { orgId: string; projectId: string | null; count: number };

export type TOrganization = { id: string; name: string; slug: string };

// Implemented by data-access/organization-data-access.ts.
export type TOrganizationDataAccess = {
  findRootOrgId(orgId: string): Promise<string | null>;
  findById(orgId: string): Promise<TOrganization | null>;
  countWorkspaces(orgId: string): Promise<number>;
};

// Implemented by data-access/usage-counter-data-access.ts. A null orgId counts the whole instance.
export type TBillableActorDataAccess = {
  countBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null): Promise<TIdentityOwnership[]>;
  countProjectIdentities(projectType: ProjectType, orgId?: string): Promise<number>;
  countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string
  ): Promise<{ users: number; identities: number }>;
  getProjectIdentityOwnershipBreakdown(projectType: ProjectType, orgId?: string): Promise<TIdentityOwnership[]>;
};
