import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSessionInlineServices } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { logger } from "@app/lib/logger";

import { TAgentVaultSessionInlineServiceSummaryRow } from "./agent-vault-session-inline-service-fns";

export type TAgentVaultSessionInlineServiceDALFactory = ReturnType<typeof agentVaultSessionInlineServiceDALFactory>;

const DELETE_SECRETS_BATCH_SIZE = 1000;

const SUMMARY_COLUMNS: string[] = [
  "id",
  "sessionId",
  "position",
  "name",
  "type",
  "config",
  "hostPattern",
  "allowedMethods",
  "allowedPathPrefixes",
  "credentialType",
  "credentialConfig",
  "customHeaders",
  "substitutions",
  "createdAt",
  "updatedAt"
];

export const agentVaultSessionInlineServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionInlineService);

  // Never selects the sealed column, so a read that lists sessions holds no secret.
  const findSummariesBySessionIds = async (
    sessionIds: string[],
    tx?: Knex
  ): Promise<TAgentVaultSessionInlineServiceSummaryRow[]> => {
    if (!sessionIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultSessionInlineService)
        .whereIn("sessionId", sessionIds)
        .select(...SUMMARY_COLUMNS)
        .orderBy("position", "asc")) as TAgentVaultSessionInlineServiceSummaryRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session inline services" });
    }
  };

  const findBySessionId = async (sessionId: string, tx?: Knex): Promise<TAgentVaultSessionInlineServices[]> => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentVaultSessionInlineService)
        .where({ sessionId })
        .orderBy("position", "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session inline services for resolve" });
    }
  };

  // Writes only the inline service rows, never the session's, whose updatedAt dates an ownerless session's last logs.
  const deleteSecretsBySessionId = async (sessionId: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.AgentVaultSessionInlineService)
        .where({ sessionId })
        .whereNotNull("encryptedSecrets")
        .update({ encryptedSecrets: null });
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault session inline service secrets" });
    }
  };

  /**
   * Deletes the secrets of every inline service whose session can no longer resolve: revoked, expired, or left without
   * its owner or the user it acts for, matching deriveSessionStatus. In batches, each its own statement, so no one
   * transaction grows with the number of sessions that ended since the last run.
   */
  const deleteSecretsOfEndedSessions = async () => {
    let deleted = 0;
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { rows } = (await db.raw(
          `UPDATE ?? AS inline_service SET "encryptedSecrets" = NULL
          WHERE inline_service.id IN (
            SELECT candidate.id FROM ?? AS candidate
            JOIN ?? AS owning_session ON owning_session.id = candidate."sessionId"
            WHERE candidate."encryptedSecrets" IS NOT NULL
              AND (
                owning_session."revokedAt" IS NOT NULL
                OR owning_session."expiresAt" <= NOW()
                OR (owning_session."userId" IS NULL AND owning_session."identityId" IS NULL)
                OR (owning_session."onBehalfOfUserName" IS NOT NULL AND owning_session."onBehalfOfUserId" IS NULL)
              )
            LIMIT ?
          )
          RETURNING inline_service.id`,
          [
            TableName.AgentVaultSessionInlineService,
            TableName.AgentVaultSessionInlineService,
            TableName.AgentVaultSession,
            DELETE_SECRETS_BATCH_SIZE
          ]
        )) as { rows: { id: string }[] };
        deleted += rows.length;
        if (rows.length < DELETE_SECRETS_BATCH_SIZE) break;
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault inline service secrets of ended sessions" });
    }
    if (deleted) {
      logger.info(`frequent-resource-cleanup: deleted the secrets of ${deleted} agent vault inline services`);
    }
  };

  return { ...orm, findSummariesBySessionIds, findBySessionId, deleteSecretsBySessionId, deleteSecretsOfEndedSessions };
};
