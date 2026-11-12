import { RuleViolationError } from "@app/domains/lib/errors";

export type TSeatLimit = {
  identityLimit: number | null;
  // Provisioning method, shown in the refusal.
  via?: string;
};

// identitiesUsed is members plus machine identities.
export class SeatUsage {
  private constructor(
    readonly membersUsed: number,
    readonly identitiesUsed: number
  ) {}

  static create({ membersUsed, identitiesUsed }: { membersUsed: number; identitiesUsed: number }): SeatUsage {
    return new SeatUsage(membersUsed, identitiesUsed);
  }

  // From organizations-projects' billable actor counts: every member also takes an identity seat.
  static fromBillableActors({ users, identities }: { users: number; identities: number }): SeatUsage {
    return new SeatUsage(users, users + identities);
  }

  // Read the usage before opening the transaction that adds the member, then check it inside.
  assertAvailable({ identityLimit, via }: TSeatLimit): void {
    if (!identityLimit || this.identitiesUsed < identityLimit) return;
    throw new RuleViolationError({
      message: `Failed to create new member${via ? ` via ${via.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
    });
  }
}
