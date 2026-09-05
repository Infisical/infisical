import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultConnections } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultConnectionDALFactory = ReturnType<typeof agentVaultConnectionDALFactory>;

export const agentVaultConnectionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultConnection);

  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultConnections[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultConnection)
        .where({ accessBundleId })
        .orderBy("name", "asc")) as TAgentVaultConnections[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault connections" });
    }
  };

  // Every connection in the project except one, so write-time conflict detection can compare a candidate
  // against both its own bundle (a hard reject) and the others (a warning) in one read.
  const findForConflictCheck = async (
    { projectId, excludeConnectionId }: { projectId: string; excludeConnectionId?: string },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.AgentVaultConnection)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultConnection}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .select(
          db.ref("id").withSchema(TableName.AgentVaultConnection),
          db.ref("name").withSchema(TableName.AgentVaultConnection),
          db.ref("hostPattern").withSchema(TableName.AgentVaultConnection),
          db.ref("accessBundleId").withSchema(TableName.AgentVaultConnection),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        );

      if (excludeConnectionId) void query.whereNot(`${TableName.AgentVaultConnection}.id`, excludeConnectionId);

      return (await query) as {
        id: string;
        name: string;
        hostPattern: string;
        accessBundleId: string;
        accessBundleName: string;
      }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault connections for conflict check" });
    }
  };

  return { ...orm, findByAccessBundleId, findForConflictCheck };
};
