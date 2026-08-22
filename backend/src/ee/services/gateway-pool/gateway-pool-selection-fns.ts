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
 * Load numbers are only worth comparing when every member is measured the same way.
 *
 * A gateway new enough to report sends its real connection count, including PAM sessions the
 * platform never sees. A gateway too old to report is counted only on the connections the platform
 * itself opened, which is always the lower number.
 *
 * So a pool mid-upgrade is the bad case: the old member always looks emptier and would soak up
 * traffic for the whole rollout. That pool gets no load awareness at all and falls back to random.
 * A pool where nobody reports is fine, because every member is measured the same lower way, so
 * comparing them is still fair.
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
