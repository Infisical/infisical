/* eslint-disable class-methods-use-this */
import { TOrganizationsProjectsService } from "../service/organizations-projects-service";

// For tests of code that uses organizations-projects: every org is its own root with nothing counted,
// until a test sets a root or replaces a method.
export class FakeOrganizationsProjectsService implements TOrganizationsProjectsService {
  // Org id to root org id. Once any root is set, an org missing from the map does not exist.
  roots = new Map<string, string>();

  workspaces = 0;

  setRoot(orgId: string, rootOrgId: string) {
    this.roots.set(orgId, rootOrgId);
    return this;
  }

  findRootOrgId: TOrganizationsProjectsService["findRootOrgId"] = async (orgId) =>
    this.roots.size ? (this.roots.get(orgId) ?? null) : orgId;

  resolveRootOrgId: TOrganizationsProjectsService["resolveRootOrgId"] = async (orgId) =>
    (await this.findRootOrgId(orgId)) ?? orgId;

  findOrganization: TOrganizationsProjectsService["findOrganization"] = async (orgId) => ({
    id: orgId,
    name: `org ${orgId}`,
    slug: `org-${orgId}`
  });

  countWorkspaces: TOrganizationsProjectsService["countWorkspaces"] = async () => this.workspaces;

  countBillableOrgActors: TOrganizationsProjectsService["countBillableOrgActors"] = async () => ({
    users: 0,
    identities: 0
  });

  getBillableIdentityOwnershipBreakdown = async () => [];

  countProjectIdentities = async () => 0;

  countProjectIdentitiesByKind = async () => ({ users: 0, identities: 0 });

  getProjectIdentityBreakdown = async () => [];
}
