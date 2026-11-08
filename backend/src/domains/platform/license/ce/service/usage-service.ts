import { TTransaction } from "@app/domains/lib/transaction-runner";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TOrgSeatUsage } from "../model/license-types";
import { IdentitiesMeter, UserIdentities } from "../model/metered-features";
import { CounterRegistry } from "./counter-registry";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { OrganizationDirectory } from "./organization-directory";

export type TUsageServiceDeps = {
  instance: InstanceEntitlementsHolder;
  counters: CounterRegistry;
  organizations: OrganizationDirectory;
  // Set by within(tx): a seat check inside a caller's transaction must count the rows that transaction
  // has written and not committed yet.
  tx?: TTransaction;
};

export type TAssertSeatAvailableInput = {
  orgId: string;
  identityLimit: number | null;
  // The provisioning method, named in the refusal.
  via?: string;
};

// Live usage counts, read on the request path.
export class UsageService {
  constructor(private readonly deps: TUsageServiceDeps) {}

  // The live count of a metered dimension for an org (on cloud) or the instance (self-hosted). Null when
  // nothing counts it.
  async countUsage(orgId: string, dimensionKey: string): Promise<number | null> {
    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) return null;
    return counter.count(this.deps.instance.isCloud() ? orgId : null, this.deps.tx);
  }

  // Seats in use: org members, and members plus machine identities. On cloud the root org's whole tree;
  // self-hosted, the whole instance.
  async getSeatUsage(orgId: string): Promise<TOrgSeatUsage> {
    let scope: string | null = null;
    if (this.deps.instance.isCloud()) {
      const root = await this.deps.organizations.findRootOrg(orgId);
      if (!root) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
      scope = root.id;
    }
    const members = this.deps.counters.get(UserIdentities.key);
    const identities = this.deps.counters.get(IdentitiesMeter.key);
    const [membersUsed, identitiesUsed] = await Promise.all([
      members ? members.count(scope, this.deps.tx) : 0,
      identities ? identities.count(scope, this.deps.tx) : 0
    ]);
    return { membersUsed, identitiesUsed };
  }

  // Refuses a new member once the plan's cap is reached.
  async assertSeatAvailable({ orgId, identityLimit, via }: TAssertSeatAvailableInput): Promise<void> {
    if (!identityLimit) return;
    const { identitiesUsed } = await this.getSeatUsage(orgId);
    if (identitiesUsed >= identityLimit) {
      throw new BadRequestError({
        message: `Failed to create new member${via ? ` via ${via.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
      });
    }
  }
}
