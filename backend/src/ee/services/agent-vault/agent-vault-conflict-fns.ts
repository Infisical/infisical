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

// Two connections conflict when they cover the same normalized host:port exactly. Containment is not a
// conflict: exact beats wildcard deterministically, which is how an override is written on purpose.
//
// Only connections in one bundle are compared, and there it is a hard reject: nothing can break the tie,
// since the runtime ladder past exact-host is bundle position and then connection name, and two connections
// in one bundle share a position. Bundles never meet at runtime while a session carries one bundle.
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
