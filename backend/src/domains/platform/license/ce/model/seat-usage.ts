import { BadRequestError } from "@app/lib/errors";

export type TSeatLimit = {
  identityLimit: number | null;
  // The provisioning method, named in the refusal.
  via?: string;
};

// Seats an org's plan is using: members, and members plus machine identities.
export class SeatUsage {
  private constructor(
    readonly membersUsed: number,
    readonly identitiesUsed: number
  ) {}

  static create({ membersUsed, identitiesUsed }: { membersUsed: number; identitiesUsed: number }): SeatUsage {
    return new SeatUsage(membersUsed, identitiesUsed);
  }

  // Refuses a new member once the plan's cap is reached. Read the usage before opening the transaction that
  // adds the member, and check it inside it.
  assertAvailable({ identityLimit, via }: TSeatLimit): void {
    if (!identityLimit || this.identitiesUsed < identityLimit) return;
    throw new BadRequestError({
      message: `Failed to create new member${via ? ` via ${via.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
    });
  }
}
