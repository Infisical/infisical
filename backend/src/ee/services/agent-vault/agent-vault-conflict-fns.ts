import { intersectHostPatterns } from "./agent-vault-host-pattern";

export type TConflictCandidate = {
  id: string;
  name: string;
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};

export type TAgentVaultConflict = {
  connectionName: string;
  accessBundleName: string;
  patterns: string[];
};

// Two connections conflict when they cover the same normalized host:port exactly. Containment is not a
// conflict: exact beats wildcard deterministically, which is how an override is written on purpose.
//
// Within one bundle this is a hard reject, because nothing can break the tie — the runtime ladder is
// exact-host, then bundle position, then connection name, and two connections in one bundle share a
// position, so the winner would come down to a name.
//
// Across bundles it is a warning only. Blocking would let one bundle veto another, and the session's
// bundle order settles it.
export const findHostPatternConflicts = (
  hostPattern: string,
  candidates: TConflictCandidate[]
): TAgentVaultConflict[] =>
  candidates
    .map((candidate) => ({
      connectionName: candidate.name,
      accessBundleName: candidate.accessBundleName,
      patterns: intersectHostPatterns(hostPattern, candidate.hostPattern)
    }))
    .filter((conflict) => conflict.patterns.length > 0);

export const describeConflict = (conflict: TAgentVaultConflict): string =>
  `'${conflict.connectionName}' already covers ${conflict.patterns.join(", ")} in this access bundle.`;
