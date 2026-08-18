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
 * False when some members report their own load and others are too old to, because the two numbers
 * are on different scales: a non-reporting member is counted only on channels this platform opened,
 * which is strictly lower than a reporting peer's true occupancy. Comparing them would pull traffic
 * onto un-upgraded gateways for a whole rollout, so such a pool gets no load awareness at all.
 */
export const isPoolComparable = <T extends TSelectableGateway>(
  candidates: T[],
  scores: Map<string, TGatewayScore>
): boolean => {
  const reportedCount = candidates.filter((c) => scores.get(c.id)?.reported).length;
  return reportedCount === 0 || reportedCount === candidates.length;
};

/** Ties are resolved by position, so shuffling first is what randomises between equally loaded members. */
export const shuffleForTieBreak = <T>(candidates: T[], random: () => number): T[] => {
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
