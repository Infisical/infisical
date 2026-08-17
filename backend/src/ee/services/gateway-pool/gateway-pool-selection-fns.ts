export type TSelectableGateway = { id: string };

// Two members this close are treated as equally loaded, since cross-pod counts are published
// asynchronously and routinely disagree by one.
const SCORE_TIE_BAND = 1;

/**
 * Picks the least-loaded member, breaking between the two lowest at random.
 *
 * The random tie-break matters because every backend pod reads the same shared counters. Taking the
 * strict minimum would make all of them choose the same idle gateway in the same instant and stampede
 * it, which is the imbalance this is meant to remove.
 */
export const chooseLeastLoadedGateway = <T extends TSelectableGateway>(
  candidates: T[],
  scores: Map<string, number>,
  random: () => number = Math.random
): T | undefined => {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // Shuffle before ranking. An idle pool scores every member zero, and a deterministic tie-break
  // would then always shortlist the same two, leaving every member past the second with no traffic
  // at all. Sort is stable, so shuffling first randomises ties while keeping the least-loaded order.
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const ranked = shuffled.sort((a, b) => (scores.get(a.id) ?? 0) - (scores.get(b.id) ?? 0));

  // Only shortlist the runner-up when it is genuinely comparable. Always taking the two lowest would
  // hand a two-member pool a coin flip regardless of load, and would still send half the traffic to a
  // near-saturated member in a pool scored {0, 99, 100}. The band absorbs the off-by-one that stale
  // cross-pod counts produce, which is the case the random draw exists for.
  const best = scores.get(ranked[0].id) ?? 0;
  const runnerUp = scores.get(ranked[1].id) ?? 0;
  const shortlist = runnerUp - best <= SCORE_TIE_BAND ? ranked.slice(0, 2) : [ranked[0]];

  return shortlist[Math.floor(random() * shortlist.length)];
};

export const pickRandomGateway = <T extends TSelectableGateway>(
  candidates: T[],
  random: () => number = Math.random
): T | undefined => {
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(random() * candidates.length)];
};
