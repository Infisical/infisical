import type { TActorOrg } from "@app/domains/lib/actor-context";

import { TActorOrgCache } from "../services/dependencies";

// Same window as the grant and project caches. Nothing invalidates an entry: a rename or a privilege system switch
// shows up when it expires.
const TTL_SECONDS = 10;
// Capped so long-lived pods don't grow forever.
const ENTRY_LIMIT = 10_000;

export class ActorOrgCache implements TActorOrgCache {
  private readonly entries = new Map<string, { org: TActorOrg; expiresAt: number }>();

  constructor(
    // 0 = read the org on every request. Tests use it so changes show up on the next request.
    private readonly ttlSeconds: number = TTL_SECONDS,
    private readonly now: () => number = Date.now
  ) {}

  async getOrLoad(orgId: string, load: () => Promise<TActorOrg | null>): Promise<TActorOrg | null> {
    const cached = this.entries.get(orgId);
    if (cached && cached.expiresAt > this.now()) return ActorOrgCache.copy(cached.org);

    const org = await load();
    this.entries.delete(orgId);
    // A missing org is never cached: one just created must be found on its first request.
    if (!org || this.ttlSeconds <= 0) return org;
    if (this.entries.size >= ENTRY_LIMIT) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(orgId, { org: ActorOrgCache.copy(org), expiresAt: this.now() + this.ttlSeconds * 1000 });
    return org;
  }

  // Requests never share an org object, so one that changes its copy can't change another's.
  private static copy(org: TActorOrg): TActorOrg {
    return { ...org, ssoPolicy: { ...org.ssoPolicy } };
  }
}
