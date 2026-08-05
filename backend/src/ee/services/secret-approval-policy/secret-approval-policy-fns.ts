import { ActorType } from "@app/services/auth/auth-type";

/**
 * Determines whether a secret approval policy should be enforced for the current actor.
 *
 * Returns `false` (skip enforcement) when:
 *   1. No policy exists for the path/env (`policy` is `undefined`)
 *   2. The actor is a machine identity and the policy allows bypass
 *
 * Acts as a TypeScript type guard: when it returns `true`, downstream code
 * can safely access `policy.id`, `policy.name`, etc.
 */
export const shouldApplyPolicy = <T extends { bypassForMachineIdentities: boolean }>(
  policy: T | undefined,
  actorType: ActorType
): policy is T => {
  if (!policy) return false;
  if (actorType === ActorType.IDENTITY && policy.bypassForMachineIdentities) return false;
  return true;
};
