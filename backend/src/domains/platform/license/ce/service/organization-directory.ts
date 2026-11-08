import { TLicenseOrganizations, TRootOrg } from "./registrations";

// An org's root never changes, so the mapping is kept for the life of the process. Bounded so a long-lived
// pod does not grow without limit.
const ROOT_ORG_CACHE_LIMIT = 10_000;

// Holds what the organizations domain registered, and caches each org's root.
export class OrganizationDirectory {
  private organizations: TLicenseOrganizations | null = null;

  private readonly roots = new Map<string, TRootOrg>();

  register(organizations: TLicenseOrganizations) {
    if (this.organizations) throw new Error("The organizations directory was registered twice");
    this.organizations = organizations;
  }

  private get registered() {
    if (!this.organizations) throw new Error("No organizations directory was registered with the License domain");
    return this.organizations;
  }

  async findRootOrg(orgId: string): Promise<TRootOrg | null> {
    const cached = this.roots.get(orgId);
    if (cached) return cached;
    const root = await this.registered.findRootOrg(orgId);
    if (!root) return null;
    if (this.roots.size >= ROOT_ORG_CACHE_LIMIT) {
      const oldest = this.roots.keys().next().value;
      if (oldest !== undefined) this.roots.delete(oldest);
    }
    this.roots.set(orgId, root);
    return root;
  }

  // The org's root id, or the org itself when it cannot be found.
  async rootOrgIdOf(orgId: string): Promise<string> {
    return (await this.findRootOrg(orgId))?.id ?? orgId;
  }

  countWorkspacesUsed(rootOrgId: string) {
    return this.registered.countWorkspacesUsed(rootOrgId);
  }
}
