import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSecretScanningDataSources } from "@app/db/schemas/secret-scanning-data-sources";
import { SecretScanningResourcesSchema } from "@app/db/schemas/secret-scanning-resources";
import { SecretScanningScansSchema } from "@app/db/schemas/secret-scanning-scans";
import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { DatabaseError } from "@app/lib/errors";
import {
  buildFindFilter,
  ormify,
  prependTableNameToFindFilter,
  selectAllTableCols,
  sqlNestRelationships,
  TFindOpt
} from "@app/lib/knex";

export type TSecretScanningV2DALFactory = ReturnType<typeof secretScanningV2DALFactory>;

type TSecretScanningDataSourceFindFilter = Parameters<typeof buildFindFilter<TSecretScanningDataSources>>[0];
type TSecretScanningDataSourceFindOptions = TFindOpt<TSecretScanningDataSources, true, "name">;

const baseSecretScanningDataSourceQuery = ({
  filter = {},
  db,
  tx
}: {
  db: TDbClient;
  filter?: TSecretScanningDataSourceFindFilter;
  options?: TSecretScanningDataSourceFindOptions;
  tx?: Knex;
}) => {
  const query = (tx || db.replicaNode())(TableName.SecretScanningDataSource)
    .join(
      TableName.AppConnection,
      `${TableName.SecretScanningDataSource}.connectionId`,
      `${TableName.AppConnection}.id`
    )
    .select(selectAllTableCols(TableName.SecretScanningDataSource))
    .select(
      // entire connection
      db.ref("name").withSchema(TableName.AppConnection).as("connectionName"),
      db.ref("method").withSchema(TableName.AppConnection).as("connectionMethod"),
      db.ref("app").withSchema(TableName.AppConnection).as("connectionApp"),
      db.ref("orgId").withSchema(TableName.AppConnection).as("connectionOrgId"),
      db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("connectionEncryptedCredentials"),
      db.ref("description").withSchema(TableName.AppConnection).as("connectionDescription"),
      db.ref("version").withSchema(TableName.AppConnection).as("connectionVersion"),
      db.ref("gatewayId").withSchema(TableName.AppConnection).as("connectionGatewayId"),
      db.ref("projectId").withSchema(TableName.AppConnection).as("connectionProjectId"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("connectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("connectionUpdatedAt"),
      db
        .ref("isPlatformManagedCredentials")
        .withSchema(TableName.AppConnection)
        .as("connectionIsPlatformManagedCredentials")
    );

  if (filter) {
    /* eslint-disable @typescript-eslint/no-misused-promises */
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretScanningDataSource, filter)));
  }

  return query;
};

const expandSecretScanningDataSource = <
  T extends Awaited<ReturnType<typeof baseSecretScanningDataSourceQuery>>[number]
>(
  dataSource: T
) => {
  const {
    connectionApp,
    connectionName,
    connectionId,
    connectionOrgId,
    connectionEncryptedCredentials,
    connectionMethod,
    connectionDescription,
    connectionCreatedAt,
    connectionUpdatedAt,
    connectionVersion,
    connectionIsPlatformManagedCredentials,
    connectionGatewayId,
    connectionProjectId,
    ...el
  } = dataSource;

  return {
    ...el,
    connectionId,
    connection: connectionId
      ? {
          app: connectionApp,
          id: connectionId,
          name: connectionName,
          orgId: connectionOrgId,
          encryptedCredentials: connectionEncryptedCredentials,
          method: connectionMethod,
          description: connectionDescription,
          createdAt: connectionCreatedAt,
          updatedAt: connectionUpdatedAt,
          version: connectionVersion,
          isPlatformManagedCredentials: connectionIsPlatformManagedCredentials,
          gatewayId: connectionGatewayId,
          projectId: connectionProjectId
        }
      : undefined
  };
};

export const secretScanningV2DALFactory = (db: TDbClient) => {
  const dataSourceOrm = ormify(db, TableName.SecretScanningDataSource);
  const resourceOrm = ormify(db, TableName.SecretScanningResource);
  const scanOrm = ormify(db, TableName.SecretScanningScan);
  const findingOrm = ormify(db, TableName.SecretScanningFinding);
  const configOrm = ormify(db, TableName.SecretScanningConfig);

  const findDataSource = async (filter: Parameters<(typeof dataSourceOrm)["find"]>[0], tx?: Knex) => {
    try {
      const dataSources = await baseSecretScanningDataSourceQuery({ filter, db, tx });

      if (!dataSources.length) return [];

      return dataSources.map(expandSecretScanningDataSource);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Secret Scanning Data Source" });
    }
  };

  const findDataSourceById = async (id: string, tx?: Knex) => {
    try {
      const dataSource = await baseSecretScanningDataSourceQuery({ filter: { id }, db, tx }).first();

      if (dataSource) return expandSecretScanningDataSource(dataSource);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By ID - Secret Scanning Data Source" });
    }
  };

  const createDataSource = async (data: Parameters<(typeof dataSourceOrm)["create"]>[0], tx?: Knex) => {
    const source = await dataSourceOrm.create(data, tx);

    const dataSource = (await baseSecretScanningDataSourceQuery({
      filter: { id: source.id },
      db,
      tx
    }).first())!;

    return expandSecretScanningDataSource(dataSource);
  };

  const updateDataSourceById = async (
    dataSourceId: string,
    data: Parameters<(typeof dataSourceOrm)["updateById"]>[1],
    tx?: Knex
  ) => {
    const source = await dataSourceOrm.updateById(dataSourceId, data, tx);

    const dataSource = (await baseSecretScanningDataSourceQuery({
      filter: { id: source.id },
      db,
      tx
    }).first())!;

    return expandSecretScanningDataSource(dataSource);
  };

  const deleteDataSourceById = async (dataSourceId: string, tx?: Knex) => {
    const dataSource = (await baseSecretScanningDataSourceQuery({
      filter: { id: dataSourceId },
      db,
      tx
    }).first())!;

    await dataSourceOrm.deleteById(dataSourceId, tx);

    return expandSecretScanningDataSource(dataSource);
  };

  const findOneDataSource = async (filter: Parameters<(typeof dataSourceOrm)["findOne"]>[0], tx?: Knex) => {
    try {
      const dataSource = await baseSecretScanningDataSourceQuery({ filter, db, tx }).first();

      if (dataSource) {
        return expandSecretScanningDataSource(dataSource);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find One - Secret Scanning Data Source" });
    }
  };

  const findDataSourceWithDetails = async (filter: Parameters<(typeof dataSourceOrm)["find"]>[0], tx?: Knex) => {
    try {
      // TODO (scott): this query will probably need to be optimized

      const dataSources = await baseSecretScanningDataSourceQuery({ filter, db, tx })
        .leftJoin(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.dataSourceId`,
          `${TableName.SecretScanningDataSource}.id`
        )
        .leftJoin(
          TableName.SecretScanningScan,
          `${TableName.SecretScanningScan}.resourceId`,
          `${TableName.SecretScanningResource}.id`
        )
        .leftJoin(
          TableName.SecretScanningFinding,
          `${TableName.SecretScanningFinding}.scanId`,
          `${TableName.SecretScanningScan}.id`
        )
        .where((qb) => {
          void qb
            .where(`${TableName.SecretScanningFinding}.status`, SecretScanningFindingStatus.Unresolved)
            .orWhereNull(`${TableName.SecretScanningFinding}.status`);
        })
        .select(
          db.ref("id").withSchema(TableName.SecretScanningScan).as("scanId"),
          db.ref("status").withSchema(TableName.SecretScanningScan).as("scanStatus"),
          db.ref("statusMessage").withSchema(TableName.SecretScanningScan).as("scanStatusMessage"),
          db.ref("createdAt").withSchema(TableName.SecretScanningScan).as("scanCreatedAt"),
          db.ref("status").withSchema(TableName.SecretScanningFinding).as("findingStatus"),
          db.ref("id").withSchema(TableName.SecretScanningFinding).as("findingId")
        );

      if (!dataSources.length) return [];

      const results = sqlNestRelationships({
        data: dataSources,
        key: "id",
        parentMapper: (dataSource) => expandSecretScanningDataSource(dataSource),
        childrenMapper: [
          {
            key: "scanId",
            label: "scans" as const,
            mapper: ({ scanId, scanCreatedAt, scanStatus, scanStatusMessage }) => ({
              id: scanId,
              createdAt: scanCreatedAt,
              status: scanStatus,
              statusMessage: scanStatusMessage
            })
          },
          {
            key: "findingId",
            label: "findings" as const,
            mapper: ({ findingId }) => ({
              id: findingId
            })
          }
        ]
      });

      return results.map(({ scans, findings, ...dataSource }) => {
        const lastScan =
          scans && scans.length
            ? scans.reduce((latest, current) => {
                return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
              })
            : null;

        return {
          ...dataSource,
          lastScanStatus: lastScan?.status ?? null,
          lastScanStatusMessage: lastScan?.statusMessage ?? null,
          lastScannedAt: lastScan?.createdAt ?? null,
          unresolvedFindings: scans.length ? findings.length : null
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Details - Secret Scanning Data Source" });
    }
  };

  const findResourcesWithDetails = async (filter: Parameters<(typeof resourceOrm)["find"]>[0], tx?: Knex) => {
    try {
      // TODO (scott): this query will probably need to be optimized

      const resources = await (tx || db.replicaNode())(TableName.SecretScanningResource)
        .where((qb) => {
          if (filter)
            void qb.where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretScanningResource, filter)));
        })
        .leftJoin(
          TableName.SecretScanningScan,
          `${TableName.SecretScanningScan}.resourceId`,
          `${TableName.SecretScanningResource}.id`
        )
        .leftJoin(
          TableName.SecretScanningFinding,
          `${TableName.SecretScanningFinding}.scanId`,
          `${TableName.SecretScanningScan}.id`
        )
        .where((qb) => {
          void qb
            .where(`${TableName.SecretScanningFinding}.status`, SecretScanningFindingStatus.Unresolved)
            .orWhereNull(`${TableName.SecretScanningFinding}.status`);
        })
        .select(selectAllTableCols(TableName.SecretScanningResource))
        .select(
          db.ref("id").withSchema(TableName.SecretScanningScan).as("scanId"),
          db.ref("status").withSchema(TableName.SecretScanningScan).as("scanStatus"),
          db.ref("type").withSchema(TableName.SecretScanningScan).as("scanType"),
          db.ref("statusMessage").withSchema(TableName.SecretScanningScan).as("scanStatusMessage"),
          db.ref("createdAt").withSchema(TableName.SecretScanningScan).as("scanCreatedAt"),
          db.ref("status").withSchema(TableName.SecretScanningFinding).as("findingStatus"),
          db.ref("id").withSchema(TableName.SecretScanningFinding).as("findingId")
        );

      if (!resources.length) return [];

      const results = sqlNestRelationships({
        data: resources,
        key: "id",
        parentMapper: (resource) => SecretScanningResourcesSchema.parse(resource),
        childrenMapper: [
          {
            key: "scanId",
            label: "scans" as const,
            mapper: ({ scanId, scanCreatedAt, scanStatus, scanStatusMessage, scanType }) => ({
              id: scanId,
              type: scanType,
              createdAt: scanCreatedAt,
              status: scanStatus,
              statusMessage: scanStatusMessage
            })
          },
          {
            key: "findingId",
            label: "findings" as const,
            mapper: ({ findingId }) => ({
              id: findingId
            })
          }
        ]
      });

      return results.map(({ scans, findings, ...resource }) => {
        const lastScan =
          scans && scans.length
            ? scans.reduce((latest, current) => {
                return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
              })
            : null;

        return {
          ...resource,
          lastScanStatus: lastScan?.status ?? null,
          lastScanStatusMessage: lastScan?.statusMessage ?? null,
          lastScannedAt: lastScan?.createdAt ?? null,
          unresolvedFindings: findings?.length ?? 0
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Details - Secret Scanning Resource" });
    }
  };

  const findScansWithDetailsByDataSourceId = async (dataSourceId: string, tx?: Knex) => {
    try {
      // TODO (scott): this query will probably need to be optimized

      const scans = await (tx || db.replicaNode())(TableName.SecretScanningScan)
        .leftJoin(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningScan}.resourceId`
        )
        .where(`${TableName.SecretScanningResource}.dataSourceId`, dataSourceId)
        .leftJoin(
          TableName.SecretScanningFinding,
          `${TableName.SecretScanningFinding}.scanId`,
          `${TableName.SecretScanningScan}.id`
        )
        .select(selectAllTableCols(TableName.SecretScanningScan))
        .select(
          db.ref("status").withSchema(TableName.SecretScanningFinding).as("findingStatus"),
          db.ref("id").withSchema(TableName.SecretScanningFinding).as("findingId"),
          db.ref("name").withSchema(TableName.SecretScanningResource).as("resourceName")
        );

      if (!scans.length) return [];

      const results = sqlNestRelationships({
        data: scans,
        key: "id",
        parentMapper: (scan) => SecretScanningScansSchema.parse(scan),
        childrenMapper: [
          {
            key: "findingId",
            label: "findings" as const,
            mapper: ({ findingId, findingStatus }) => ({
              id: findingId,
              status: findingStatus
            })
          },
          {
            key: "resourceId",
            label: "resources" as const,
            mapper: ({ resourceName }) => ({
              name: resourceName
            })
          }
        ]
      });

      return results.map(({ findings, resources, ...scan }) => {
        return {
          ...scan,
          unresolvedFindings:
            findings?.filter((finding) => finding.status === SecretScanningFindingStatus.Unresolved).length ?? 0,
          resolvedFindings:
            findings?.filter((finding) => finding.status !== SecretScanningFindingStatus.Unresolved).length ?? 0,
          resourceName: resources[0].name
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Details By Data Source ID - Secret Scanning Scan" });
    }
  };

  const findScansByDataSourceId = async (dataSourceId: string, tx?: Knex) => {
    try {
      const scans = await (tx || db.replicaNode())(TableName.SecretScanningScan)
        .leftJoin(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningScan}.resourceId`
        )
        .where(`${TableName.SecretScanningResource}.dataSourceId`, dataSourceId)

        .select(selectAllTableCols(TableName.SecretScanningScan));

      return scans;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Data Source ID - Secret Scanning Scan" });
    }
  };

  return {
    dataSources: {
      ...dataSourceOrm,
      find: findDataSource,
      findById: findDataSourceById,
      findOne: findOneDataSource,
      create: createDataSource,
      updateById: updateDataSourceById,
      deleteById: deleteDataSourceById,
      findWithDetails: findDataSourceWithDetails
    },
    resources: {
      ...resourceOrm,
      findWithDetails: findResourcesWithDetails
    },
    scans: {
      ...scanOrm,
      findWithDetailsByDataSourceId: findScansWithDetailsByDataSourceId,
      findByDataSourceId: findScansByDataSourceId
    },
    findings: findingOrm,
    configs: configOrm
  };
};
