import { TRootOrg } from "../model/root-org";

// An org's root never changes, so the mapping is kept for the life of the process. Bounded so a long-lived
// pod does not grow without limit.
const ROOT_ORG_CACHE_LIMIT = 10_000;

export class RootOrgCache {
  private readonly roots = new Map<string, TRootOrg>();

  constructor(private readonly resolve: (orgId: string) => Promise<TRootOrg | null>) {}

  async get(orgId: string): Promise<TRootOrg | null> {
    const cached = this.roots.get(orgId);
    if (cached) return cached;
    const root = await this.resolve(orgId);
    if (!root) return null;
    if (this.roots.size >= ROOT_ORG_CACHE_LIMIT) {
      const oldest = this.roots.keys().next().value;
      if (oldest !== undefined) this.roots.delete(oldest);
    }
    this.roots.set(orgId, root);
    return root;
  }
}
