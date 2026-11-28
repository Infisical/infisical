/* eslint-disable class-methods-use-this */
import { TOrganizationsService } from "../services/organizations/service";

// Every org is its own root and counts are zero until a test sets a root or overrides a method.
export class FakeOrganizationsService implements TOrganizationsService {
  // orgId -> rootOrgId. Once non-empty, orgs missing from it don't exist.
  roots = new Map<string, string>();

  setRoot(orgId: string, rootOrgId: string) {
    this.roots.set(orgId, rootOrgId);
    return this;
  }

  findRootOrgId: TOrganizationsService["findRootOrgId"] = async (orgId) =>
    this.roots.size ? (this.roots.get(orgId) ?? null) : orgId;

  resolveRootOrgId: TOrganizationsService["resolveRootOrgId"] = async (orgId) =>
    (await this.findRootOrgId(orgId)) ?? orgId;

  findOrganization: TOrganizationsService["findOrganization"] = async (orgId) => ({
    id: orgId,
    name: `org ${orgId}`,
    slug: `org-${orgId}`
  });

  countBillableOrgActors: TOrganizationsService["countBillableOrgActors"] = async () => ({
    users: 0,
    identities: 0
  });

  getBillableIdentityOwnershipBreakdown = async () => [];

  within = () => ({
    lockAndCountBillableOrgActors: async (orgId: string | null) => {
      if (orgId === null) return this.countBillableOrgActors(null);
      const rootOrgId = await this.findRootOrgId(orgId);
      return rootOrgId ? this.countBillableOrgActors(rootOrgId) : null;
    }
  });
}
