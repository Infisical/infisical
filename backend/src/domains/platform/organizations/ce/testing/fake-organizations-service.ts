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

  // Orgs findOrganization treats as missing.
  missing = new Set<string>();

  findOrganization: TOrganizationsService["findOrganization"] = async (orgId) =>
    this.missing.has(orgId) ? null : { id: orgId, name: `org ${orgId}`, slug: `org-${orgId}` };

  // What the name lists return; tests set it.
  orgNames: { id: string; name: string; rootOrgId: string | null }[] = [];

  listOrgTreeNames: TOrganizationsService["listOrgTreeNames"] = async (orgId) => {
    const rootOrgId = (await this.findRootOrgId(orgId)) ?? orgId;
    return this.orgNames.filter((org) => (org.rootOrgId ?? org.id) === rootOrgId);
  };

  listAllOrgNames: TOrganizationsService["listAllOrgNames"] = async () => [...this.orgNames];

  listRootOrganizations: TOrganizationsService["listRootOrganizations"] = async ({ search, limit, offset }) => {
    const term = search?.toLowerCase();
    const roots = this.orgNames
      .filter((org) => !org.rootOrgId)
      .map((org) => ({ id: org.id, name: org.name, slug: `org-${org.id}` }))
      .filter((org) => !term || org.name.toLowerCase().includes(term) || org.slug.includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { organizations: roots.slice(offset, offset + limit), totalCount: roots.length };
  };

  countBillableOrgActors: TOrganizationsService["countBillableOrgActors"] = async () => ({
    users: 0,
    identities: 0
  });

  getBillableIdentityOwnershipBreakdown: TOrganizationsService["getBillableIdentityOwnershipBreakdown"] =
    async () => [];

  within = () => ({
    lockAndCountBillableOrgActors: async (orgId: string | null) => {
      if (orgId === null) return this.countBillableOrgActors(null);
      const rootOrgId = await this.findRootOrgId(orgId);
      return rootOrgId ? this.countBillableOrgActors(rootOrgId) : null;
    }
  });
}
