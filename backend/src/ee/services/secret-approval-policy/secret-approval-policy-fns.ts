import picomatch from "picomatch";

import { containsGlobPatterns } from "@app/lib/picomatch";
import { ActorType } from "@app/services/auth/auth-type";

export const getPolicyScore = (policy: { secretPath?: string | null }) =>
  // if glob pattern score is 1, if not exist score is 0 and if its not both then its exact path meaning score 2
  // eslint-disable-next-line
  policy.secretPath ? (containsGlobPatterns(policy.secretPath) ? 1 : 2) : 0;

// picks the highest-priority policy governing a secret path: exact path match first, then glob, then env-scoped.
// Legacy and approval-system policies are resolved together, so the tie-break is explicit rather than
// relying on the order one DAL happened to return.
export const resolvePolicyForPath = <T extends { secretPath?: string | null; createdAt: Date; id: string }>(
  policies: T[],
  secretPath: string
) =>
  policies
    .filter(
      ({ secretPath: policyPath }) => !policyPath || picomatch.isMatch(secretPath, policyPath, { strictSlashes: false })
    )
    .sort(
      (a, b) =>
        getPolicyScore(b) - getPolicyScore(a) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    )
    .shift();

/**
 * Returns the committer ID fields for a secret approval request,
 * setting the appropriate field based on the actor type.
 */
export const getCommitterIds = (actor: ActorType, actorId: string) => ({
  committerUserId: actor === ActorType.USER ? actorId : undefined,
  committerIdentityId: actor === ActorType.IDENTITY ? actorId : undefined
});

/**
 * Determines whether a secret approval policy should be enforced for the current actor.
 *
 * Returns `false` (skip enforcement) when:
 *   1. No policy exists for the path/env (`policy` is `undefined`)
 *   2. The actor is a machine identity and the policy allows bypass
 *   3. The actor is neither a USER nor an IDENTITY (e.g. PLATFORM, SCIM_CLIENT)
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
  if (actorType !== ActorType.USER && actorType !== ActorType.IDENTITY) return false;
  return true;
};
