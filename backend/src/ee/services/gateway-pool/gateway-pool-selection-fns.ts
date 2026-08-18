import { TGatewayScore } from "@app/lib/gateway-v2/gateway-load-tracker";

export type TSelectableGateway = { id: string };

// Only exact ties are randomised. A reservation is worth exactly +1, so any wider band would cancel
// it out and re-shortlist the member a concurrent selection just claimed, which is the stampede the
// reservation exists to prevent.
const SCORE_TIE_BAND = 0;

export const pickRandomGateway = <T extends TSelectableGateway>(
  candidates: T[],
  random: () => number = Math.random
): T | undefined => {
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(random() * candidates.length)];
};

/**
 * Picks the least-loaded member, breaking between the two lowest at random.
 *
 * The random tie-break matters because every backend pod reads the same shared counters. Taking the
 * strict minimum would make all of them choose the same idle gateway in the same instant and stampede
 * it, which is the imbalance this is meant to remove.
 */
export const chooseLeastLoadedGateway = <T extends TSelectableGateway>(
  candidates: T[],
  scores: Map<string, TGatewayScore>,
  random: () => number = Math.random
): T | undefined => {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // A member too old to report its own count is scored only on the channels this platform opened,
  // which is a strictly lower number than a reporting peer's true occupancy. Comparing the two would
  // make the un-upgraded member look idle and pull traffic toward it for the whole rollout, so a
  // mixed pool gets no load awareness at all rather than a biased guess.
  const reportedCount = candidates.filter((c) => scores.get(c.id)?.reported).length;
  if (reportedCount > 0 && reportedCount < candidates.length) {
    return pickRandomGateway(candidates, random);
  }

  // Shuffle before ranking. An idle pool scores every member zero, and a deterministic tie-break
  // would then always shortlist the same two, leaving every member past the second with no traffic
  // at all. Sort is stable, so shuffling first randomises ties while keeping the least-loaded order.
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const scoreOf = (id: string) => scores.get(id)?.score ?? 0;
  const ranked = shuffled.sort((a, b) => scoreOf(a.id) - scoreOf(b.id));

  // Only shortlist the runner-up when it ties. Always taking the two lowest would hand a two-member
  // pool a coin flip regardless of load, and would still send half the traffic to a near-saturated
  // member in a pool scored {0, 99, 100}.
  const best = scoreOf(ranked[0].id);
  const runnerUp = scoreOf(ranked[1].id);
  const shortlist = runnerUp - best <= SCORE_TIE_BAND ? ranked.slice(0, 2) : [ranked[0]];

  return shortlist[Math.floor(random() * shortlist.length)];
};
