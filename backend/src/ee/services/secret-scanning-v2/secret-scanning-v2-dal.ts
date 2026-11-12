import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretScanningScansSchema,
  TableName,
  TSecretScanningDataSources,
  TSecretScanningFindings,
  TSecretScanningResources
} from "@app/db/schemas";
import {
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus,
  SecretScanningResourceOrderBy,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  TFindingLocationRow,
  TSecretScanningScannedLocation
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray, sanitizeSqlLikeString } from "@app/lib/fn";
import {
  buildFindFilter,
  ormify,
  prependTableNameToFindFilter,
  selectAllTableCols,
  sqlNestRelationships,
  TFindOpt
} from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

export type TSecretScanningV2DALFactory = ReturnType<typeof secretScanningV2DALFactory>;

export type TListSecretScanningFindingsFilter = {
  status?: SecretScanningFindingStatus;
  dataSourceId?: string;
  resourceId?: string;
  scanId?: string;
  orderBy: SecretScanningFindingOrderBy;
  orderDirection: OrderByDirection;
  offset: number;
  limit: number;
};

export type TListSecretScanningResourcesFilter = {
  search?: string;
  orderBy: SecretScanningResourceOrderBy;
  orderDirection: OrderByDirection;
  offset: number;
  limit: number;
};

const FINDING_STATUS_SORT_ORDER = [
  SecretScanningFindingStatus.Unresolved,
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.FalsePositive,
  SecretScanningFindingStatus.Ignore
];

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
      db.ref("gatewayPoolId").withSchema(TableName.AppConnection).as("connectionGatewayPoolId"),
      db.ref("projectId").withSchema(TableName.AppConnection).as("connectionProjectId"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("connectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("connectionUpdatedAt"),
      db.ref("isAutoRotationEnabled").withSchema(TableName.AppConnection).as("connectionIsAutoRotationEnabled"),
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
    connectionIsAutoRotationEnabled,
    connectionEncryptedCredentials,
    connectionMethod,
    connectionDescription,
    connectionCreatedAt,
    connectionUpdatedAt,
    connectionVersion,
    connectionIsPlatformManagedCredentials,
    connectionGatewayId,
    connectionGatewayPoolId,
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
          isAutoRotationEnabled: connectionIsAutoRotationEnabled,
          isPlatformManagedCredentials: connectionIsPlatformManagedCredentials,
          gatewayId: connectionGatewayId,
          gatewayPoolId: connectionGatewayPoolId,
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

  // Postgres has a hard limit of how many itens can be upserted, so to prevent
  // issues in very large repositories with lots of findings, we should batch
  // the inserts to prevent the worker from exiting and failing the scan.
  const FINDINGS_UPSERT_CHUNK_SIZE = 1000;

  /**
   * Saves what a scan found in one resource. A finding is one secret value in the resource, and each place it was
   * found is a location of it. A location the resource already has is left as it is, so rescanning history changes
   * nothing. A new location creates its value's finding, or reopens it if it was resolved, since the value turning up
   * somewhere new after it was resolved is a regression. False positives and ignored findings only gain the location.
   *
   * Returns every row's finding, including rows an earlier scan saved, and the findings this call reopened.
   */
  const persistFindingLocations = async (
    { resourceId, scanId, rows }: { resourceId: string; scanId: string; rows: TFindingLocationRow[] },
    tx: Knex
  ) => {
    try {
      const findingIdByFingerprint = new Map<string, string>();

      for (const chunk of chunkArray(
        [...new Set(rows.map(({ fingerprint }) => fingerprint))],
        FINDINGS_UPSERT_CHUNK_SIZE
      )) {
        // eslint-disable-next-line no-await-in-loop
        const locations = await tx(TableName.SecretScanningFindingLocation)
          .where({ resourceId })
          .whereIn("fingerprint", chunk)
          .select("fingerprint", "findingId");

        locations.forEach(({ fingerprint, findingId }) => findingIdByFingerprint.set(fingerprint, findingId));
      }

      const newRowByFingerprint = new Map<string, TFindingLocationRow>();
      rows.forEach((row) => {
        if (!findingIdByFingerprint.has(row.fingerprint) && !newRowByFingerprint.has(row.fingerprint)) {
          newRowByFingerprint.set(row.fingerprint, row);
        }
      });
      const newRows = [...newRowByFingerprint.values()];

      // a value's first new row gives a new finding its rule, severity and first location
      const newRowByValue = new Map<string, TFindingLocationRow>();
      newRows.forEach((row) => {
        if (!newRowByValue.has(row.secretFindingBlindIndex)) newRowByValue.set(row.secretFindingBlindIndex, row);
      });

      const now = new Date();
      const reopenedFindingIds: string[] = [];

      // Sorted so concurrent scans lock the findings they share in the same order (blind indexes are lowercase hex, so
      // this is also Postgres's order). Each value appears once, since an upsert can't touch the same row twice.
      for (const chunk of chunkArray([...newRowByValue.keys()].sort(), FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const upserted = (await tx(TableName.SecretScanningFinding)
          .insert(
            chunk.map((secretFindingBlindIndex) => {
              const { rule, severity, fingerprint, details } = newRowByValue.get(secretFindingBlindIndex)!;
              // the first location is kept on the finding too, for the release before locations existed
              return {
                resourceId,
                secretFindingBlindIndex,
                rule,
                severity,
                lastDetectedAt: now,
                scanId,
                fingerprint,
                details
              };
            })
          )
          .onConflict(["resourceId", "secretFindingBlindIndex"])
          .merge({ status: SecretScanningFindingStatus.Unresolved, resolvedAt: null })
          .where(`${TableName.SecretScanningFinding}.status`, SecretScanningFindingStatus.Resolved)
          .returning(["id", tx.raw("(xmax = 0) AS inserted")])) as { id: string; inserted: boolean }[];

        reopenedFindingIds.push(...upserted.filter(({ inserted }) => !inserted).map(({ id }) => id));
      }

      const findingByValue = new Map<string, Pick<TSecretScanningFindings, "id" | "status">>();
      for (const chunk of chunkArray([...newRowByValue.keys()], FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const findings = await tx(TableName.SecretScanningFinding)
          .where({ resourceId })
          .whereIn("secretFindingBlindIndex", chunk)
          .select("id", "status", "secretFindingBlindIndex");

        findings.forEach(({ id, status, secretFindingBlindIndex }) =>
          findingByValue.set(secretFindingBlindIndex as string, { id, status })
        );
      }

      // the upsert above already locked these rows, so this takes no new locks
      for (const chunk of chunkArray(
        [...findingByValue.values()].map(({ id }) => id),
        FINDINGS_UPSERT_CHUNK_SIZE
      )) {
        // eslint-disable-next-line no-await-in-loop
        await tx(TableName.SecretScanningFinding).whereIn("id", chunk).update({ lastDetectedAt: now });
      }

      for (const chunk of chunkArray(newRows, FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await tx(TableName.SecretScanningFindingLocation)
          .insert(
            chunk.map(({ fingerprint, rule, details, secretFindingBlindIndex }) => ({
              findingId: findingByValue.get(secretFindingBlindIndex)!.id,
              resourceId,
              scanId,
              fingerprint,
              rule,
              details
            }))
          )
          // a diff scan can overlap a full scan of the same resource; the location is the same either way
          .onConflict(["resourceId", "fingerprint"])
          .ignore();
      }

      // A location saved before may belong to a finding from before blind indexes existed, so it's found by its id.
      const findingById = new Map<string, Pick<TSecretScanningFindings, "id" | "status">>();
      for (const chunk of chunkArray([...new Set(findingIdByFingerprint.values())], FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const findings = await tx(TableName.SecretScanningFinding).whereIn("id", chunk).select("id", "status");

        findings.forEach((finding) => findingById.set(finding.id, finding));
      }

      const scannedLocations: TSecretScanningScannedLocation[] = rows.map(({ fingerprint, rule, details, ...row }) => {
        const existingFindingId = findingIdByFingerprint.get(fingerprint);
        const finding = existingFindingId
          ? findingById.get(existingFindingId)!
          : findingByValue.get(row.secretFindingBlindIndex)!;

        return { id: finding.id, status: finding.status, fingerprint, rule, details };
      });

      return { scannedLocations, reopenedFindingIds };
    } catch (error) {
      throw new DatabaseError({ error, name: "Persist Locations - Secret Scanning Finding" });
    }
  };

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
        .select(
          db.ref("id").withSchema(TableName.SecretScanningScan).as("scanId"),
          db.ref("status").withSchema(TableName.SecretScanningScan).as("scanStatus"),
          db.ref("statusMessage").withSchema(TableName.SecretScanningScan).as("scanStatusMessage"),
          db.ref("createdAt").withSchema(TableName.SecretScanningScan).as("scanCreatedAt"),
          db.ref("startedAt").withSchema(TableName.SecretScanningScan).as("scanStartedAt")
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
            mapper: ({ scanId, scanCreatedAt, scanStartedAt, scanStatus, scanStatusMessage }) => ({
              id: scanId,
              createdAt: scanCreatedAt,
              startedAt: scanStartedAt,
              status: scanStatus,
              statusMessage: scanStatusMessage
            })
          }
        ]
      });

      const dataSourceIds = results.map(({ id }) => id);

      const [resourceCounts, unresolvedFindingCounts] = await Promise.all([
        (tx || db.replicaNode())(TableName.SecretScanningResource)
          .whereIn("dataSourceId", dataSourceIds)
          .groupBy("dataSourceId")
          .select("dataSourceId")
          .count({ count: "*" }),
        (tx || db.replicaNode())(TableName.SecretScanningFinding)
          .join(
            TableName.SecretScanningResource,
            `${TableName.SecretScanningResource}.id`,
            `${TableName.SecretScanningFinding}.resourceId`
          )
          .whereIn(`${TableName.SecretScanningResource}.dataSourceId`, dataSourceIds)
          .where(`${TableName.SecretScanningFinding}.status`, SecretScanningFindingStatus.Unresolved)
          .groupBy(`${TableName.SecretScanningResource}.dataSourceId`)
          .select(`${TableName.SecretScanningResource}.dataSourceId`)
          .count({ count: "*" })
      ]);

      const resourceCountByDataSourceId = new Map(
        resourceCounts.map(({ dataSourceId, count }) => [dataSourceId, Number(count)])
      );
      const unresolvedFindingCountByDataSourceId = new Map(
        unresolvedFindingCounts.map(({ dataSourceId, count }) => [dataSourceId as string, Number(count)])
      );

      return results.map(({ scans, ...dataSource }) => {
        const lastScan =
          scans && scans.length
            ? scans.reduce((latest, current) => {
                return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
              })
            : null;

        // a queued scan has no start time yet, so the last scan time comes from the latest scan that actually started
        const lastScannedAt = scans.reduce<Date | null>((latest, { startedAt }) => {
          if (!startedAt) return latest;
          return !latest || new Date(startedAt) > new Date(latest) ? startedAt : latest;
        }, null);

        return {
          ...dataSource,
          lastScanStatus: lastScan?.status ?? null,
          lastScanStatusMessage: lastScan?.statusMessage ?? null,
          lastScannedAt,
          unresolvedFindings: scans.length ? (unresolvedFindingCountByDataSourceId.get(dataSource.id) ?? 0) : null,
          resourceCount: resourceCountByDataSourceId.get(dataSource.id) ?? 0
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Details - Secret Scanning Data Source" });
    }
  };

  const findResourcesWithDetailsByDataSourceId = async (
    dataSourceId: string,
    { search, orderBy, orderDirection, offset, limit }: TListSecretScanningResourcesFilter,
    tx?: Knex
  ) => {
    try {
      const conn = tx || db.replicaNode();
      const direction = orderDirection === OrderByDirection.ASC ? "asc" : "desc";

      const baseQuery = conn(TableName.SecretScanningResource).where(
        `${TableName.SecretScanningResource}.dataSourceId`,
        dataSourceId
      );

      if (search) {
        void baseQuery.whereILike(`${TableName.SecretScanningResource}.name`, `%${sanitizeSqlLikeString(search)}%`);
      }

      const resourcesQuery = baseQuery
        .clone()
        .joinRaw(
          `LEFT JOIN LATERAL (SELECT "status", "statusMessage", "createdAt" FROM ?? WHERE "resourceId" = ??.id ORDER BY "createdAt" DESC LIMIT 1) AS "lastScan" ON TRUE`,
          [TableName.SecretScanningScan, TableName.SecretScanningResource]
        )
        // a queued scan has no start time yet, so the last scan time comes from the latest scan that actually started
        .joinRaw(
          `LEFT JOIN LATERAL (SELECT "startedAt" FROM ?? WHERE "resourceId" = ??.id AND "startedAt" IS NOT NULL ORDER BY "startedAt" DESC LIMIT 1) AS "lastStartedScan" ON TRUE`,
          [TableName.SecretScanningScan, TableName.SecretScanningResource]
        )
        .joinRaw(
          `LEFT JOIN LATERAL (SELECT COUNT(*)::int AS "count" FROM ?? WHERE "resourceId" = ??.id AND "status" = ?) AS "unresolved" ON TRUE`,
          [TableName.SecretScanningFinding, TableName.SecretScanningResource, SecretScanningFindingStatus.Unresolved]
        )
        .select(selectAllTableCols(TableName.SecretScanningResource))
        .select(
          db.ref("status").withSchema("lastScan").as("lastScanStatus"),
          db.ref("statusMessage").withSchema("lastScan").as("lastScanStatusMessage"),
          db.ref("startedAt").withSchema("lastStartedScan").as("lastScannedAt"),
          db.ref("count").withSchema("unresolved").as("unresolvedFindings")
        );

      switch (orderBy) {
        case SecretScanningResourceOrderBy.Status:
          // mirrors the precedence of the status the UI shows: an unfinished last scan wins over findings
          void resourcesQuery
            .orderByRaw(
              `CASE
                WHEN "lastScan"."status" = ? THEN 0
                WHEN "lastScan"."status" = ? THEN 2
                WHEN "lastScan"."status" = ? THEN 3
                WHEN "lastScan"."status" IS NULL THEN 4
                WHEN "unresolved"."count" > 0 THEN 1
                ELSE 5
              END ${direction}`,
              [SecretScanningScanStatus.Failed, SecretScanningScanStatus.Scanning, SecretScanningScanStatus.Queued]
            )
            .orderBy("unresolvedFindings", direction === "asc" ? "desc" : "asc");
          break;
        case SecretScanningResourceOrderBy.LastScanned:
          // never-scanned resources go last in either direction
          void resourcesQuery.orderByRaw(`"lastStartedScan"."startedAt" ${direction} NULLS LAST`);
          break;
        case SecretScanningResourceOrderBy.Name:
        default:
          void resourcesQuery.orderByRaw(`LOWER(??) ${direction}`, [`${TableName.SecretScanningResource}.name`]);
      }

      // a unique tiebreaker keeps rows from repeating or vanishing across pages when sort values tie
      void resourcesQuery.orderBy(`${TableName.SecretScanningResource}.id`, direction).offset(offset).limit(limit);

      const countQuery = baseQuery
        .clone()
        .count({ count: `${TableName.SecretScanningResource}.id` })
        .first();

      const [resources, countResult] = await Promise.all([resourcesQuery, countQuery]);

      return {
        resources: resources as (TSecretScanningResources & {
          lastScanStatus: SecretScanningScanStatus | null;
          lastScanStatusMessage: string | null;
          lastScannedAt: Date | null;
          unresolvedFindings: number;
        })[],
        totalCount: Number(countResult?.count ?? 0)
      };
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
          TableName.SecretScanningFindingLocation,
          `${TableName.SecretScanningFindingLocation}.scanId`,
          `${TableName.SecretScanningScan}.id`
        )
        .leftJoin(
          TableName.SecretScanningFinding,
          `${TableName.SecretScanningFinding}.id`,
          `${TableName.SecretScanningFindingLocation}.findingId`
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

  // Locks the data source's resources until the transaction ends, so concurrent scan requests check for in-flight
  // scans one at a time. Ordered so two lockers take the rows in the same order and can't deadlock.
  const findResourcesByDataSourceIdForUpdate = async (dataSourceId: string, tx: Knex) => {
    try {
      return await tx(TableName.SecretScanningResource).where({ dataSourceId }).orderBy("id").forUpdate();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find For Update - Secret Scanning Resource" });
    }
  };

  // Reads the primary: the caller writes these rows straight after, and a replica that still shows
  // a just-completed scan as in-progress would have it reaped.
  const findStuckScans = async (startedBefore: Date, limit: number, tx?: Knex) => {
    try {
      const scans = await (tx || db)(TableName.SecretScanningScan)
        // A realtime scan still queued this long lost its job: nothing redelivers it, unlike a queued historical scan.
        .where((qb) => {
          void qb
            .where(`${TableName.SecretScanningScan}.status`, SecretScanningScanStatus.Scanning)
            .orWhere((queued) => {
              void queued
                .where(`${TableName.SecretScanningScan}.status`, SecretScanningScanStatus.Queued)
                .where(`${TableName.SecretScanningScan}.type`, SecretScanningScanType.Realtime);
            });
        })
        // A batched full scan outlives any single scan timeout, so what is being measured is time
        // since the scan last made progress, not time since it started. `progressUpdatedAt` is
        // stamped as each commit batch is persisted; rows written before it existed, or by a pod
        // still running an older image mid-deploy, fall back to the start and then the creation
        // time so they're reaped too.
        .whereRaw(`COALESCE(??, ??, ??) < ?`, [
          `${TableName.SecretScanningScan}.progressUpdatedAt`,
          `${TableName.SecretScanningScan}.startedAt`,
          `${TableName.SecretScanningScan}.createdAt`,
          startedBefore
        ])
        .join(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningScan}.resourceId`
        )
        .select(selectAllTableCols(TableName.SecretScanningScan))
        .select(
          db.ref("name").withSchema(TableName.SecretScanningResource).as("resourceName"),
          db.ref("dataSourceId").withSchema(TableName.SecretScanningResource)
        )
        .orderBy(`${TableName.SecretScanningScan}.createdAt`, "asc")
        .limit(limit);

      return scans;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Stuck - Secret Scanning Scan" });
    }
  };

  // Reads the primary: a scan committed moments ago may not have reached a replica yet.
  const findQueuedHistoricalScans = async (createdBefore: Date, limit: number, tx?: Knex) => {
    try {
      return await (tx || db)(TableName.SecretScanningScan)
        .join(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningScan}.resourceId`
        )
        .where(`${TableName.SecretScanningScan}.status`, SecretScanningScanStatus.Queued)
        .where(`${TableName.SecretScanningScan}.type`, SecretScanningScanType.Historical)
        .where(`${TableName.SecretScanningScan}.createdAt`, "<", createdBefore)
        .select(
          db.ref("id").withSchema(TableName.SecretScanningScan),
          db.ref("resourceId").withSchema(TableName.SecretScanningScan),
          db.ref("dataSourceId").withSchema(TableName.SecretScanningResource)
        )
        .orderBy(`${TableName.SecretScanningScan}.createdAt`, "asc")
        .limit(limit);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Queued Historical - Secret Scanning Scan" });
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

  const baseFindingQuery = (tx?: Knex) =>
    (tx || db.replicaNode())(TableName.SecretScanningFinding)
      .join(
        TableName.SecretScanningResource,
        `${TableName.SecretScanningResource}.id`,
        `${TableName.SecretScanningFinding}.resourceId`
      )
      .join(
        TableName.SecretScanningDataSource,
        `${TableName.SecretScanningDataSource}.id`,
        `${TableName.SecretScanningResource}.dataSourceId`
      );

  const findingWithDetailsQuery = (tx?: Knex) =>
    baseFindingQuery(tx)
      .select(selectAllTableCols(TableName.SecretScanningFinding))
      .select(
        db.ref("projectId").withSchema(TableName.SecretScanningDataSource),
        db.ref("id").withSchema(TableName.SecretScanningDataSource).as("dataSourceId"),
        db.ref("name").withSchema(TableName.SecretScanningDataSource).as("dataSourceName"),
        db.ref("type").withSchema(TableName.SecretScanningDataSource).as("dataSourceType"),
        db.ref("name").withSchema(TableName.SecretScanningResource).as("resourceName"),
        db.raw(`(SELECT count(*)::int FROM ?? WHERE ?? = ??) AS "locationCount"`, [
          TableName.SecretScanningFindingLocation,
          `${TableName.SecretScanningFindingLocation}.findingId`,
          `${TableName.SecretScanningFinding}.id`
        ])
      );

  const applyFindingFilters = <Q extends Knex.QueryBuilder>(
    query: Q,
    projectId: string,
    {
      status,
      dataSourceId,
      resourceId,
      scanId
    }: Pick<TListSecretScanningFindingsFilter, "status" | "dataSourceId" | "resourceId" | "scanId">
  ) => {
    void query.where(`${TableName.SecretScanningDataSource}.projectId`, projectId);
    if (status) void query.where(`${TableName.SecretScanningFinding}.status`, status);
    if (dataSourceId) void query.where(`${TableName.SecretScanningDataSource}.id`, dataSourceId);
    if (resourceId) void query.where(`${TableName.SecretScanningFinding}.resourceId`, resourceId);
    // the findings the scan found a new location of
    if (scanId) {
      void query.whereExists((subQuery) => {
        void subQuery
          .select(db.raw("1"))
          .from(TableName.SecretScanningFindingLocation)
          .whereRaw("?? = ??", [
            `${TableName.SecretScanningFindingLocation}.findingId`,
            `${TableName.SecretScanningFinding}.id`
          ])
          .where(`${TableName.SecretScanningFindingLocation}.scanId`, scanId);
      });
    }
    return query;
  };

  const applyFindingOrder = <Q extends Knex.QueryBuilder>(
    query: Q,
    orderBy: SecretScanningFindingOrderBy,
    orderDirection: OrderByDirection
  ) => {
    const direction = orderDirection === OrderByDirection.ASC ? "asc" : "desc";

    switch (orderBy) {
      case SecretScanningFindingOrderBy.Rule:
        void query.orderBy(`${TableName.SecretScanningFinding}.rule`, direction);
        break;
      case SecretScanningFindingOrderBy.ResourceName:
        void query.orderBy(`${TableName.SecretScanningResource}.name`, direction);
        break;
      case SecretScanningFindingOrderBy.Status:
        void query.orderByRaw(
          `CASE ?? ${FINDING_STATUS_SORT_ORDER.map(() => "WHEN ? THEN ?").join(" ")} END ${direction}`,
          [
            `${TableName.SecretScanningFinding}.status`,
            ...FINDING_STATUS_SORT_ORDER.flatMap((status, index) => [status, index])
          ]
        );
        break;
      case SecretScanningFindingOrderBy.CreatedAt:
        void query.orderBy(`${TableName.SecretScanningFinding}.createdAt`, direction);
        break;
      case SecretScanningFindingOrderBy.LastDetectedAt:
      default:
        void query.orderBy(`${TableName.SecretScanningFinding}.lastDetectedAt`, direction);
    }

    // a unique tiebreaker keeps rows from repeating or vanishing across pages when sort values tie
    void query.orderBy(`${TableName.SecretScanningFinding}.id`, direction);
    return query;
  };

  const findFindingsByProjectId = async (
    projectId: string,
    { orderBy, orderDirection, offset, limit, ...filter }: TListSecretScanningFindingsFilter,
    tx?: Knex
  ) => {
    try {
      const findingsQuery = applyFindingOrder(
        applyFindingFilters(findingWithDetailsQuery(tx), projectId, filter),
        orderBy,
        orderDirection
      )
        .offset(offset)
        .limit(limit);

      const countQuery = applyFindingFilters(baseFindingQuery(tx), projectId, filter)
        .count({ count: `${TableName.SecretScanningFinding}.id` })
        .first();

      const [findings, countResult] = await Promise.all([findingsQuery, countQuery]);

      return {
        findings: findings as ((typeof findings)[number] & { locationCount: number })[],
        totalCount: Number(countResult?.count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Project ID - Secret Scanning Finding" });
    }
  };

  const findFindingByIdWithDetails = async (findingId: string, tx?: Knex) => {
    try {
      const finding = await findingWithDetailsQuery(tx)
        .where(`${TableName.SecretScanningFinding}.id`, findingId)
        .first();

      return finding as (typeof finding & { locationCount: number }) | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By ID - Secret Scanning Finding" });
    }
  };

  const countFindingsByProjectId = async (
    projectId: string,
    filter: { status?: SecretScanningFindingStatus } = {},
    tx?: Knex
  ) => {
    try {
      const query = baseFindingQuery(tx).where(`${TableName.SecretScanningDataSource}.projectId`, projectId);

      if (filter.status) void query.where(`${TableName.SecretScanningFinding}.status`, filter.status);

      const result = await query.count({ count: `${TableName.SecretScanningFinding}.id` }).first();

      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count By Project ID - Secret Scanning Finding" });
    }
  };

  /**
   * Counts the locations this scan was the first to find, and the findings they belong to. A finding still unresolved
   * is a leak to notify about: one new, one reopened, or a new location of an open one. It is read back from the
   * database rather than accumulated in the handler because a full scan persists its findings batch by batch and can be
   * retried or resumed by another worker: whatever an in-memory counter holds covers only the batches that one attempt
   * happened to run.
   *
   * Read from the primary, not a replica: the caller counts immediately after writing the last
   * batch, so replication lag would report a total short of what it just stored.
   */
  const countFindingsByScanId = async (scanId: string, tx?: Knex) => {
    try {
      const [result] = (await (tx || db)(TableName.SecretScanningFindingLocation)
        .join(
          TableName.SecretScanningFinding,
          `${TableName.SecretScanningFinding}.id`,
          `${TableName.SecretScanningFindingLocation}.findingId`
        )
        .where(`${TableName.SecretScanningFindingLocation}.scanId`, scanId)
        .select(
          db.raw("count(*) AS locations"),
          db.raw("count(DISTINCT ??) AS findings", [`${TableName.SecretScanningFinding}.id`]),
          db.raw("count(DISTINCT ??) FILTER (WHERE ?? = ?) AS unresolved", [
            `${TableName.SecretScanningFinding}.id`,
            `${TableName.SecretScanningFinding}.status`,
            SecretScanningFindingStatus.Unresolved
          ])
        )) as { locations: string; findings: string; unresolved: string }[];

      return {
        locations: Number(result?.locations ?? 0),
        findings: Number(result?.findings ?? 0),
        unresolvedFindings: Number(result?.unresolved ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Count By Scan ID - Secret Scanning Finding" });
    }
  };

  // Ordered newest first, which is the order a finding's locations are shown in.
  const findLocationsByFindingId = async (
    findingId: string,
    { offset, limit }: { offset: number; limit: number },
    tx?: Knex
  ) => {
    try {
      const baseQuery = (tx || db.replicaNode())(TableName.SecretScanningFindingLocation).where({ findingId });

      const [locations, countResult] = await Promise.all([
        baseQuery.clone().orderBy("createdAt", "desc").orderBy("id", "desc").offset(offset).limit(limit),
        baseQuery.clone().count({ count: "*" }).first()
      ]);

      return { locations, totalCount: Number(countResult?.count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Finding ID - Secret Scanning Finding Location" });
    }
  };

  const primaryNode = () => db.primaryNode();

  return {
    primaryNode,
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
      findWithDetailsByDataSourceId: findResourcesWithDetailsByDataSourceId,
      findByDataSourceIdForUpdate: findResourcesByDataSourceIdForUpdate
    },
    scans: {
      ...scanOrm,
      findWithDetailsByDataSourceId: findScansWithDetailsByDataSourceId,
      findByDataSourceId: findScansByDataSourceId,
      findStuck: findStuckScans,
      findQueuedHistorical: findQueuedHistoricalScans
    },
    findings: {
      ...findingOrm,
      persistLocations: persistFindingLocations,
      countByScanId: countFindingsByScanId,
      findByProjectId: findFindingsByProjectId,
      findByIdWithDetails: findFindingByIdWithDetails,
      countByProjectId: countFindingsByProjectId
    },
    locations: {
      findByFindingId: findLocationsByFindingId
    },
    configs: configOrm
  };
};
