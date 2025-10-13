import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TExternalMigrationConfigsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";

export type TExternalMigrationConfigDALFactory = ReturnType<typeof externalMigrationConfigDALFactory>;

export const externalMigrationConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ExternalMigrationConfig);

  const upsert = async (data: TExternalMigrationConfigsInsert, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.ExternalMigrationConfig)
        .insert(data)
        .onConflict(["orgId", "platform"])
        .merge()
        .returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertExternalMigrationConfig" });
    }
  };

  const findOne = async (filter: { orgId: string; platform: string }, tx?: Knex) => {
    try {
      const result = await (tx || db?.replicaNode?.() || db)(TableName.ExternalMigrationConfig)
        .leftJoin(
          TableName.AppConnection,
          `${TableName.AppConnection}.id`,
          `${TableName.ExternalMigrationConfig}.connectionId`
        )
        /* eslint-disable @typescript-eslint/no-misused-promises */
        .where(buildFindFilter(prependTableNameToFindFilter(TableName.ExternalMigrationConfig, filter)))
        .select(selectAllTableCols(TableName.ExternalMigrationConfig))
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

  return { ...orm, upsert, findOne };
};
