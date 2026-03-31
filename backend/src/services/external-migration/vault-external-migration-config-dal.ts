import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";

export type TVaultExternalMigrationConfigDALFactory = ReturnType<typeof vaultExternalMigrationConfigDALFactory>;

const buildConnectionJoin = (qb: ReturnType<TDbClient["replicaNode"]>, db: TDbClient) =>
  qb
    .leftJoin(TableName.AppConnection, `${TableName.AppConnection}.id`, `${TableName.ExternalMigrationConfig}.connectionId`)
    .select(selectAllTableCols(TableName.ExternalMigrationConfig))
    .select(
      db.ref("id").withSchema(TableName.AppConnection).as("appConnectionId"),
      db.ref("name").withSchema(TableName.AppConnection).as("appConnectionName"),
      db.ref("app").withSchema(TableName.AppConnection).as("appConnectionApp"),
      db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("appConnectionEncryptedCredentials"),
      db.ref("orgId").withSchema(TableName.AppConnection).as("appConnectionOrgId"),
      db.ref("isAutoRotationEnabled").withSchema(TableName.AppConnection).as("appConnectionIsAutoRotationEnabled"),
      db.ref("method").withSchema(TableName.AppConnection).as("appConnectionMethod"),
      db.ref("description").withSchema(TableName.AppConnection).as("appConnectionDescription"),
      db.ref("version").withSchema(TableName.AppConnection).as("appConnectionVersion"),
      db.ref("gatewayId").withSchema(TableName.AppConnection).as("appConnectionGatewayId"),
      db.ref("projectId").withSchema(TableName.AppConnection).as("appConnectionProjectId"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("appConnectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("appConnectionUpdatedAt")
    );

const mapResultToConnection = (result: Record<string, unknown>) => ({
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
        updatedAt: result.appConnectionUpdatedAt,
        isAutoRotationEnabled: result.appConnectionIsAutoRotationEnabled
      }
    : undefined
});

export const vaultExternalMigrationConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ExternalMigrationConfig);

  const findOne = async (filter: { orgId: string; namespace?: string; provider?: string }, tx?: Knex) => {
    try {
      const qb = (tx || db?.replicaNode?.() || db)(TableName.ExternalMigrationConfig);
      buildConnectionJoin(qb, db);
      qb.where(buildFindFilter(prependTableNameToFindFilter(TableName.ExternalMigrationConfig, filter)));

      const result = await qb.first();
      if (!result) return undefined;

      return mapResultToConnection(result as Record<string, unknown>);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const findWithConnection = async (filter: { orgId: string; provider?: string }, tx?: Knex) => {
    try {
      const qb = (tx || db?.replicaNode?.() || db)(TableName.ExternalMigrationConfig);
      buildConnectionJoin(qb, db);
      qb.where(buildFindFilter(prependTableNameToFindFilter(TableName.ExternalMigrationConfig, filter)));

      const results = await qb;
      return (results as Record<string, unknown>[]).map(mapResultToConnection);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with connection" });
    }
  };

  return { ...orm, findOne, findWithConnection };
};
