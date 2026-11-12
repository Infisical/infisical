import { ProjectType } from "@app/db/schemas";

import { TBillableActorDataAccess, TIdentityOwnership, TOrganization, TOrganizationDataAccess } from "./dependencies";

// An org's root never changes, so cache it for the process. Capped so long-lived pods don't grow forever.
const ROOT_ORG_CACHE_LIMIT = 10_000;

export type TOrganizationsProjectsService = {
  // Null when the org doesn't exist.
  findRootOrgId(orgId: string): Promise<string | null>;
  // Falls back to the org itself when it doesn't exist.
  resolveRootOrgId(orgId: string): Promise<string>;
  // Not cached: name and slug can change.
  findOrganization(orgId: string): Promise<TOrganization | null>;
  // Includes sub-orgs.
  countWorkspaces(orgId: string): Promise<number>;
  // Org members in a Secret Manager/KMS project or in none. Null orgId = whole instance.
  countBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null): Promise<TIdentityOwnership[]>;
  countProjectIdentities(projectType: ProjectType, orgId?: string): Promise<number>;
  countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string
  ): Promise<{ users: number; identities: number }>;
  getProjectIdentityBreakdown(projectType: ProjectType, orgId?: string): Promise<TIdentityOwnership[]>;
};

export type TOrganizationsProjectsServiceDeps = {
  organizations: TOrganizationDataAccess;
  billableActors: TBillableActorDataAccess;
};

export class OrganizationsProjectsService implements TOrganizationsProjectsService {
  private readonly rootOrgIds = new Map<string, string>();

  constructor(private readonly deps: TOrganizationsProjectsServiceDeps) {}

  async findRootOrgId(orgId: string): Promise<string | null> {
    const cached = this.rootOrgIds.get(orgId);
    if (cached) return cached;
    const root = await this.deps.organizations.findRootOrgId(orgId);
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
    return this.deps.organizations.findById(orgId);
  }

  countWorkspaces(orgId: string): Promise<number> {
    return this.deps.organizations.countWorkspaces(orgId);
  }

  countBillableOrgActors(orgId: string | null) {
    return this.deps.billableActors.countBillableOrgActors(orgId);
  }

  getBillableIdentityOwnershipBreakdown(orgId: string | null) {
    return this.deps.billableActors.getBillableIdentityOwnershipBreakdown(orgId);
  }

  countProjectIdentities(projectType: ProjectType, orgId?: string) {
    return this.deps.billableActors.countProjectIdentities(projectType, orgId);
  }

  countProjectIdentitiesByKind(projectType: ProjectType, orgId?: string) {
    return this.deps.billableActors.countProjectIdentitiesByKind(projectType, orgId);
  }

  getProjectIdentityBreakdown(projectType: ProjectType, orgId?: string) {
    return this.deps.billableActors.getProjectIdentityOwnershipBreakdown(projectType, orgId);
  }
}
