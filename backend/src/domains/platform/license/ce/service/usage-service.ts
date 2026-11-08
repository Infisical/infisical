import { NotFoundError } from "@app/lib/errors";

import { Meter } from "../model/meter";
import { SeatUsage } from "../model/seat-usage";
import { CounterRegistry } from "./counter-registry";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { OrganizationDirectory } from "./organization-directory";

export type TUsageServiceDeps = {
  instance: InstanceEntitlementsHolder;
  counters: CounterRegistry;
  organizations: OrganizationDirectory;
};

// Live usage counts, read on the request path.
export class UsageService {
  constructor(private readonly deps: TUsageServiceDeps) {}

  // The live count of a metered dimension for an org (on cloud) or the instance (self-hosted). Null when
  // nothing counts it.
  async countUsage(orgId: string, dimensionKey: string): Promise<number | null> {
    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) return null;
    return counter.count(this.deps.instance.isCloud() ? orgId : null);
  }

  // Seats in use: org members, and members plus machine identities. On cloud the root org's whole tree;
  // self-hosted, the whole instance.
  async getSeatUsage(orgId: string): Promise<SeatUsage> {
    if (!this.deps.instance.isCloud()) return this.countSeats(null);
    const root = await this.deps.organizations.findRootOrg(orgId);
    if (!root) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return this.countSeats(root.id);
  }

  // Seats in use across every org on the instance, which is what an instance-wide identity limit caps.
  getInstanceSeatUsage(): Promise<SeatUsage> {
    return this.countSeats(null);
  }

  private async countSeats(scope: string | null): Promise<SeatUsage> {
    const members = this.deps.counters.get(Meter.UserIdentities.key);
    const identities = this.deps.counters.get(Meter.Identities.key);
    const [membersUsed, identitiesUsed] = await Promise.all([
      members ? members.count(scope) : 0,
      identities ? identities.count(scope) : 0
    ]);
    return SeatUsage.create({ membersUsed, identitiesUsed });
  }
}
