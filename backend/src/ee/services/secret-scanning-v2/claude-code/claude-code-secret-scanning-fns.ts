import { Knex } from "knex";

import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TFindingsPayload } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { PgSqlLock } from "@app/keystore/keystore";

import { ClaudeCodeSecretStatus } from "./claude-code-secret-scanning-enums";

// What a secret's newest finding means for a prompt that holds it. A reviewer accepts a secret by marking it a false
// positive or ignoring it, so it is never reported again. Resolved means the secret was dealt with, usually revoked
// or rotated, so seeing it again is a new incident and it is recorded as a new finding.
export const getClaudeCodeSecretStatus = (newestFindingStatus: string | undefined) => {
  switch (newestFindingStatus) {
    // no existing finding OR if the latest existing finding is already resolved (treated as regression / re-introduced secret), return as new finding
    case undefined:
    case SecretScanningFindingStatus.Resolved:
      return ClaudeCodeSecretStatus.NewFinding;

    case SecretScanningFindingStatus.FalsePositive:
    case SecretScanningFindingStatus.Ignore:
      return ClaudeCodeSecretStatus.Allowed;

    default:
      return ClaudeCodeSecretStatus.PendingResolution;
  }
};

// Keeps only the findings for secrets that are new or came back after being resolved, decided again when they are
// saved rather than when the prompt was submitted. Two prompts with the same new secret can be scanned at once, and a
// reviewer can act in between; without this, the slower scan would add a duplicate finding, or re-open a secret the
// reviewer just accepted.
//
// Runs inside the insert transaction. The advisory lock makes a second scan in the project wait until the first one
// commits, so it sees that finding.
export const filterClaudeCodeFindingsToRecord = async ({
  secretScanningV2DAL,
  projectId,
  findings,
  tx
}: {
  secretScanningV2DAL: Pick<TSecretScanningV2DALFactory, "findings">;
  projectId: string;
  findings: TFindingsPayload;
  tx: Knex;
}): Promise<TFindingsPayload> => {
  const blindIndexes = [
    ...new Set(findings.map((finding) => finding.secretFindingBlindIndex).filter((index): index is string => !!index))
  ];

  if (!blindIndexes.length) return findings;

  await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.RecordClaudeCodeFindings(projectId)]);

  const newestFindings = await secretScanningV2DAL.findings.findNewestStatusesByProjectIdAndBlindIndexes(
    projectId,
    blindIndexes,
    tx
  );
  const newestStatusByBlindIndex = new Map(
    newestFindings.map((finding) => [finding.secretFindingBlindIndex, finding.status])
  );

  return findings.filter(
    (finding) =>
      !finding.secretFindingBlindIndex ||
      getClaudeCodeSecretStatus(newestStatusByBlindIndex.get(finding.secretFindingBlindIndex)) ===
        ClaudeCodeSecretStatus.NewFinding
  );
};
