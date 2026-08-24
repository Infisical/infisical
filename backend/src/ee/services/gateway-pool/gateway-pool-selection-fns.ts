import { TGatewayScore } from "@app/lib/gateway-v2/gateway-load-tracker";

export type TSelectableGateway = { id: string };

export const pickRandomGateway = <T extends TSelectableGateway>(
  candidates: T[],
  random: () => number = Math.random
): T | undefined => {
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(random() * candidates.length)];
};

/**
 * Load-aware selection only runs when every member reports its own connection count.
 *
 * A gateway new enough to report sends its real count, including PAM sessions the platform never
 * sees. A gateway too old to report can only be scored on the connections the platform itself
 * opened, which is always lower and misses whatever it is really carrying. There is no way to line
 * those two numbers up, and no reason to trust the second one on its own, so any pool that is not
 * fully upgraded picks at random instead.
 */
export const everyMemberReportsLoad = <T extends TSelectableGateway>(
  candidates: T[],
  scores: Map<string, TGatewayScore>
): boolean => candidates.length > 0 && candidates.every((candidate) => scores.get(candidate.id)?.reported);

/** Ties are resolved by position, so shuffling first is what randomises between equally loaded members. */
export const shuffleForTieBreak = <T>(candidates: T[], random: () => number): T[] => {
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
