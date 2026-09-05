import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultAccessBundles } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultAccessBundleDALFactory = ReturnType<typeof agentVaultAccessBundleDALFactory>;

export type TAgentVaultAccessBundleListRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  connectionCount: number;
  /** Every host pattern across the bundle's connections, so the list row can draw its icon stack. */
  hostPatterns: string[];
};

export const agentVaultAccessBundleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultAccessBundle);

  // One query for the list page. accessBundleIds narrows to what a member can reach; null means admin.
  const findForList = async (
    { projectId, accessBundleIds }: { projectId: string; accessBundleIds: string[] | null },
    tx?: Knex
  ): Promise<TAgentVaultAccessBundleListRow[]> => {
    if (accessBundleIds?.length === 0) return [];

    try {
      const rows = (await (tx || db.replicaNode())(TableName.AgentVaultAccessBundle)
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .where((qb) => {
          if (accessBundleIds) void qb.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
        })
        .leftJoin(
          TableName.AgentVaultConnection,
          `${TableName.AgentVaultConnection}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("description").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("createdAt").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("id").withSchema(TableName.AgentVaultConnection).as("connectionId"),
          db.ref("hostPattern").withSchema(TableName.AgentVaultConnection)
        )
        .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")) as {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
        connectionId: string | null;
        hostPattern: string | null;
      }[];

      const byBundle = new Map<string, TAgentVaultAccessBundleListRow>();
      rows.forEach((row) => {
        let bundle = byBundle.get(row.id);
        if (!bundle) {
          bundle = {
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.createdAt,
            connectionCount: 0,
            hostPatterns: []
          };
          byBundle.set(row.id, bundle);
        }
        if (!row.connectionId) return;
        bundle.connectionCount += 1;
        if (row.hostPattern) bundle.hostPatterns.push(...row.hostPattern.split(","));
      });

      return [...byBundle.values()];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundles" });
    }
  };

  // Scoped by projectId so a bundle in another org is a miss, which the service turns into a 404.
  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultAccessBundles | undefined> => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentVaultAccessBundle).where({ id, projectId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle by id" });
    }
  };

  return { ...orm, findForList, findByIdInProject };
};
