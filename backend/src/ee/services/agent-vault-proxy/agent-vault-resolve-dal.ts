import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TAgentVaultResolveDALFactory = ReturnType<typeof agentVaultResolveDALFactory>;

export type TResolveConnectionRow = {
  id: string;
  name: string;
  accessBundleName: string;
  hostPattern: string;
  credentialType: string;
  credentialConfig: unknown;
  encryptedCredential: Buffer | null;
  position: number;
};

export const agentVaultResolveDALFactory = (db: TDbClient) => {
  /**
   * The hot path, and an intersection: a session's bundle set is a ceiling fixed at mint, re-checked against
   * live grants on every resolve, so losing a grant empties a running session without touching its row.
   *
   * Read on the replica, so replica lag adds to the one-poll-interval staleness promise.
   */
  const findResolvableConnections = async (
    {
      sessionId,
      projectId,
      accessBundleIds
    }: {
      sessionId: string;
      projectId: string;
      accessBundleIds: string[] | null;
    },
    tx?: Knex
  ): Promise<TResolveConnectionRow[]> => {
    if (accessBundleIds?.length === 0) return [];
    try {
      const conn = tx || db.replicaNode();

      const query = conn(TableName.AgentVaultSessionAccessBundle)
        .where(`${TableName.AgentVaultSessionAccessBundle}.sessionId`, sessionId)
        .whereNotNull(`${TableName.AgentVaultSessionAccessBundle}.accessBundleId`)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultSessionAccessBundle}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .join(
          TableName.AgentVaultConnection,
          `${TableName.AgentVaultConnection}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        );

      if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);

      return (await query
        .select(
          db.ref("id").withSchema(TableName.AgentVaultConnection),
          db.ref("name").withSchema(TableName.AgentVaultConnection),
          db.ref("hostPattern").withSchema(TableName.AgentVaultConnection),
          db.ref("credentialType").withSchema(TableName.AgentVaultConnection),
          db.ref("credentialConfig").withSchema(TableName.AgentVaultConnection),
          db.ref("encryptedCredential").withSchema(TableName.AgentVaultConnection),
          db.ref("accessBundleName").withSchema(TableName.AgentVaultSessionAccessBundle),
          db.ref("position").withSchema(TableName.AgentVaultSessionAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")
        .orderBy(`${TableName.AgentVaultConnection}.name`, "asc")) as TResolveConnectionRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resolvable agent vault connections" });
    }
  };

  return { findResolvableConnections };
};
