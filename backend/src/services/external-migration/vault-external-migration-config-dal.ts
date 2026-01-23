import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";

export type TVaultExternalMigrationConfigDALFactory = ReturnType<typeof vaultExternalMigrationConfigDALFactory>;

export const vaultExternalMigrationConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.VaultExternalMigrationConfig);

  const findOne = async (filter: { orgId: string; namespace: string }, tx?: Knex) => {
    try {
      const result = await (tx || db?.replicaNode?.() || db)(TableName.VaultExternalMigrationConfig)
        .leftJoin(
          TableName.AppConnection,
          `${TableName.AppConnection}.id`,
          `${TableName.VaultExternalMigrationConfig}.connectionId`
        )
        /* eslint-disable @typescript-eslint/no-misused-promises */
        .where(buildFindFilter(prependTableNameToFindFilter(TableName.VaultExternalMigrationConfig, filter)))
        .select(selectAllTableCols(TableName.VaultExternalMigrationConfig))
        .select(
          db.ref("id").withSchema(TableName.AppConnection).as("appConnectionId"),
          db.ref("name").withSchema(TableName.AppConnection).as("appConnectionName"),
          db.ref("app").withSchema(TableName.AppConnection).as("appConnectionApp"),
          db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("appConnectionEncryptedCredentials"),
          db.ref("orgId").withSchema(TableName.AppConnection).as("appConnectionOrgId"),
          db.ref("method").withSchema(TableName.AppConnection).as("appConnectionMethod"),
          db.ref("description").withSchema(TableName.AppConnection).as("appConnectionDescription"),
          db.ref("version").withSchema(TableName.AppConnection).as("appConnectionVersion"),
          db.ref("gatewayId").withSchema(TableName.AppConnection).as("appConnectionGatewayId"),
          db.ref("projectId").withSchema(TableName.AppConnection).as("appConnectionProjectId"),
          db.ref("createdAt").withSchema(TableName.AppConnection).as("appConnectionCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.AppConnection).as("appConnectionUpdatedAt")
        )
        .first();

      if (!result) return undefined;

      return {
        ...result,
        connection: result.appConnectionId
          ? {
              id: result.appConnectionId,
              name: result.appConnectionName,
              app: result.appConnectionApp,
              encryptedCredentials: result.appConnectionEncryptedCredentials,
              orgId: result.appConnectionOrgId,
              method: result.appConnectionMethod,
              description: result.appConnectionDescription,
              version: result.appConnectionVersion,
              gatewayId: result.appConnectionGatewayId,
              projectId: result.appConnectionProjectId,
              createdAt: result.appConnectionCreatedAt,
              updatedAt: result.appConnectionUpdatedAt
            }
          : undefined
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  return { ...orm, findOne };
};
