import { intersectHostPatterns } from "./agent-vault-host-pattern-fns";

export type TConflictCandidate = {
  id: string;
  name: string;
  // Null for a database or SSH service, which no HTTP request can match and so never overlaps another.
  hostPattern?: string | null;
};

export type TAgentVaultConflict = {
  serviceName: string;
  patterns: string[];
};

// Containment is not a conflict: an exact host beats a wildcard deterministically, which is how an override is written.
export const findHostPatternConflicts = (
  hostPattern: string | null | undefined,
  candidates: TConflictCandidate[]
): TAgentVaultConflict[] =>
  candidates
    .map((candidate) => ({
      serviceName: candidate.name,
      patterns: hostPattern && candidate.hostPattern ? intersectHostPatterns(hostPattern, candidate.hostPattern) : []
    }))
    .filter((conflict) => conflict.patterns.length > 0);

export const describeConflict = (conflict: TAgentVaultConflict): string =>
  `'${conflict.serviceName}' already covers ${conflict.patterns.join(", ")} in this access bundle.`;
