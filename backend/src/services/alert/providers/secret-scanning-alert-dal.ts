import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TSecretScanningAlertDALFactory = ReturnType<typeof secretScanningAlertDALFactory>;

export type TSecretScanningAlertScan = {
  scanId: string;
  scanType: string;
  scanTrigger: string | null;
  resourceName: string;
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: string;
};

export const secretScanningAlertDALFactory = (db: TDbClient) => {
  // Primary on purpose: the event is emitted in the transaction that closes the scan, and an empty read
  // here is terminal, so a lagging replica would swallow the notification.
  const findScansByIds = async ({
    projectId,
    dataSourceId,
    scanIds,
    scanTriggers
  }: {
    projectId: string;
    dataSourceId: string;
    scanIds: string[];
    scanTriggers?: string[];
  }): Promise<TSecretScanningAlertScan[]> => {
    if (scanIds.length === 0) return [];
    try {
      return (await db
        .primaryNode()(TableName.SecretScanningScan)
        .join(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningScan}.resourceId`,
          `${TableName.SecretScanningResource}.id`
        )
        .join(
          TableName.SecretScanningDataSource,
          `${TableName.SecretScanningResource}.dataSourceId`,
          `${TableName.SecretScanningDataSource}.id`
        )
        .whereIn(`${TableName.SecretScanningScan}.id`, scanIds)
        .where(`${TableName.SecretScanningDataSource}.projectId`, projectId)
        .where(`${TableName.SecretScanningDataSource}.id`, dataSourceId)
        .modify((qb) => {
          if (scanTriggers) void qb.whereIn(`${TableName.SecretScanningScan}.trigger`, scanTriggers);
        })
        .select(
          db.ref("id").withSchema(TableName.SecretScanningScan).as("scanId"),
          db.ref("type").withSchema(TableName.SecretScanningScan).as("scanType"),
          db.ref("trigger").withSchema(TableName.SecretScanningScan).as("scanTrigger"),
          db.ref("name").withSchema(TableName.SecretScanningResource).as("resourceName"),
          db.ref("id").withSchema(TableName.SecretScanningDataSource).as("dataSourceId"),
          db.ref("name").withSchema(TableName.SecretScanningDataSource).as("dataSourceName"),
          db.ref("type").withSchema(TableName.SecretScanningDataSource).as("dataSourceType")
        )) as TSecretScanningAlertScan[];
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretScanningAlert: findScansByIds" });
    }
  };

  const findDataSourcesByIds = async (
    projectId: string,
    dataSourceIds: string[]
  ): Promise<{ id: string; name: string }[]> => {
    if (dataSourceIds.length === 0) return [];
    try {
      return (await db
        .replicaNode()(TableName.SecretScanningDataSource)
        .whereIn("id", dataSourceIds)
        .where({ projectId })
        .select("id", "name")) as { id: string; name: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretScanningAlert: findDataSourcesByIds" });
    }
  };

  const findDataSourceNamesByIds = async (orgId: string, dataSourceIds: string[]): Promise<Map<string, string>> => {
    if (dataSourceIds.length === 0) return new Map();
    try {
      const dataSources = (await db
        .replicaNode()(TableName.SecretScanningDataSource)
        .join(TableName.Project, `${TableName.SecretScanningDataSource}.projectId`, `${TableName.Project}.id`)
        .whereIn(`${TableName.SecretScanningDataSource}.id`, dataSourceIds)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.SecretScanningDataSource),
          db.ref("name").withSchema(TableName.SecretScanningDataSource)
        )) as { id: string; name: string }[];
      return new Map(dataSources.map(({ id, name }) => [id, name]));
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretScanningAlert: findDataSourceNamesByIds" });
    }
  };

  return { findScansByIds, findDataSourcesByIds, findDataSourceNamesByIds };
};
