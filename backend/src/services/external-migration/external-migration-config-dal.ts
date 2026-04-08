import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TExternalMigrationConfigs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";

export type TExternalMigrationConfigDALFactory = ReturnType<typeof externalMigrationConfigDALFactory>;

const buildConnectionJoin = (qb: Knex.QueryBuilder, db: TDbClient) =>
  qb
    .leftJoin(
      TableName.AppConnection,
      `${TableName.AppConnection}.id`,
      `${TableName.ExternalMigrationConfig}.connectionId`
    )
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

const mapResultToConnection = (raw: Record<string, unknown>) => {
  const result = raw as TExternalMigrationConfigs & Record<string, unknown>;
  return {
    ...result,
    connection: raw.appConnectionId
      ? {
          id: raw.appConnectionId as string,
          name: raw.appConnectionName as string,
          app: raw.appConnectionApp,
          encryptedCredentials: raw.appConnectionEncryptedCredentials as Buffer,
          orgId: raw.appConnectionOrgId as string,
          method: raw.appConnectionMethod,
          description: raw.appConnectionDescription,
          version: raw.appConnectionVersion,
          gatewayId: raw.appConnectionGatewayId,
          projectId: raw.appConnectionProjectId,
          createdAt: raw.appConnectionCreatedAt as Date,
          updatedAt: raw.appConnectionUpdatedAt as Date,
          isAutoRotationEnabled: raw.appConnectionIsAutoRotationEnabled as boolean
        }
      : undefined
  };
};

export const externalMigrationConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ExternalMigrationConfig);

  const findOne = async (filter: { orgId: string; provider?: string; connectionId?: string | null }, tx?: Knex) => {
    try {
      const qb = buildConnectionJoin((tx || db?.replicaNode?.() || db)(TableName.ExternalMigrationConfig), db);
      /* eslint-disable @typescript-eslint/no-misused-promises */
      void qb.where(buildFindFilter(prependTableNameToFindFilter(TableName.ExternalMigrationConfig, filter)));
      /* eslint-enable @typescript-eslint/no-misused-promises */

      const result = (await qb.first()) as Record<string, unknown> | undefined;
      if (!result) return undefined;

      return mapResultToConnection(result);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const findWithConnection = async (filter: { orgId: string; provider?: string }, tx?: Knex) => {
    try {
      const qb = buildConnectionJoin((tx || db?.replicaNode?.() || db)(TableName.ExternalMigrationConfig), db);
      /* eslint-disable @typescript-eslint/no-misused-promises */
      void qb.where(buildFindFilter(prependTableNameToFindFilter(TableName.ExternalMigrationConfig, filter)));
      /* eslint-enable @typescript-eslint/no-misused-promises */

      const results = (await qb) as Record<string, unknown>[];
      return results.map(mapResultToConnection);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with connection" });
    }
  };

  return { ...orm, findOne, findWithConnection };
};
