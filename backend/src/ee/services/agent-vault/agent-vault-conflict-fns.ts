import { intersectHostPatterns } from "./agent-vault-host-pattern";

export type TConflictCandidate = {
  id: string;
  name: string;
  hostPattern: string;
};

export type TAgentVaultConflict = {
  connectionName: string;
  patterns: string[];
};

// Containment is not a conflict: an exact host beats a wildcard deterministically, which is how an override is written.
export const findHostPatternConflicts = (
  hostPattern: string,
  candidates: TConflictCandidate[]
): TAgentVaultConflict[] =>
  candidates
    .map((candidate) => ({
      connectionName: candidate.name,
      patterns: intersectHostPatterns(hostPattern, candidate.hostPattern)
    }))
    .filter((conflict) => conflict.patterns.length > 0);

export const describeConflict = (conflict: TAgentVaultConflict): string =>
  `'${conflict.connectionName}' already covers ${conflict.patterns.join(", ")} in this access bundle.`;
