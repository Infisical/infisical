import { BadRequestError } from "@app/lib/errors";

import { TOrgSeatUsage } from "./license-types";

export type TSeatLimit = {
  identityLimit: number | null;
  // The provisioning method, named in the refusal.
  via?: string;
};

// Refuses a new member once the plan's cap is reached. Read the seat usage before opening the transaction
// that adds the member, and check it here, inside it.
export const assertSeatAvailable = ({ identitiesUsed }: TOrgSeatUsage, { identityLimit, via }: TSeatLimit) => {
  if (!identityLimit || identitiesUsed < identityLimit) return;
  throw new BadRequestError({
    message: `Failed to create new member${via ? ` via ${via.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
  });
};
