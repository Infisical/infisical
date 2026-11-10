import { ProjectType } from "@app/db/schemas";
import { SeatUsage } from "@app/domains/platform/license/ce/module";

import { TBillableActorDataAccess, TIdentityOwnership, TOrganization, TOrganizationDataAccess } from "./dependencies";

// An org's root never changes, so the mapping is kept for the life of the process. Bounded so a long-lived
// pod does not grow without limit.
const ROOT_ORG_CACHE_LIMIT = 10_000;

export type TOrganizationsProjectsService = {
  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  findRootOrgId(orgId: string): Promise<string | null>;
  // The org's root, or the org itself when it does not exist.
  resolveRootOrgId(orgId: string): Promise<string>;
  // Read fresh, not cached: an org's name and slug can change. Null when the org does not exist.
  findOrganization(orgId: string): Promise<TOrganization | null>;
  // Live projects that take a workspace slot on a plan, in the org and its sub-orgs.
  countWorkspaces(orgId: string): Promise<number>;
  // Seats in use: org members, and members plus machine identities. A null orgId counts the whole instance.
  countSeats(orgId: string | null): Promise<SeatUsage>;
  // Billable users and machine identities: org members in a Secret Manager or KMS project or in none.
  // A null orgId counts the whole instance.
  countBillableOrgActors(orgId: string | null): Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown(orgId: string | null): Promise<TIdentityOwnership[]>;
  // Users and machine identities in projects of one type, directly or through a group.
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

  async countSeats(orgId: string | null): Promise<SeatUsage> {
    const { users, identities } = await this.deps.billableActors.countBillableOrgActors(orgId);
    return SeatUsage.create({ membersUsed: users, identitiesUsed: users + identities });
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
