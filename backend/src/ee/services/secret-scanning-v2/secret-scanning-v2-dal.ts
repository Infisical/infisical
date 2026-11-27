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
import { PgSqlLock } from "@app/keystore/keystore";
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

type TFindingResourceOrder = { resourceId?: string | null; dataSourceId?: string | null; scanId?: string | null };

export type TSecretScanningFindingResource = {
  id: string;
  name: string;
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: string;
  locationCount: number;
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

// A row with no value groups only with its own place, so it's a finding of its own. A fingerprint contains colons and a
// blind index is hex, so the two keys can't collide.
const valueKeyOf = ({
  secretFindingBlindIndex,
  fingerprint
}: Pick<TFindingLocationRow, "secretFindingBlindIndex" | "fingerprint">) => secretFindingBlindIndex ?? fingerprint;

type TMergedFinding = Pick<
  TSecretScanningFindings,
  | "id"
  | "resourceId"
  | "scanId"
  | "rule"
  | "status"
  | "triagedAt"
  | "triagedByUserId"
  | "triageComment"
  | "resolvedAt"
  | "lastDetectedAt"
  | "createdAt"
>;

const MERGED_STATUS_PRECEDENCE: string[] = [
  SecretScanningFindingStatus.Unresolved,
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.Ignore,
  SecretScanningFindingStatus.FalsePositive
];

const MERGED_STATUS_LABEL: Record<SecretScanningFindingStatus, string> = {
  [SecretScanningFindingStatus.Unresolved]: "unresolved",
  [SecretScanningFindingStatus.Resolved]: "resolved",
  [SecretScanningFindingStatus.Ignore]: "ignored",
  [SecretScanningFindingStatus.FalsePositive]: "false positive"
};

// The merged finding takes the safest status, so a leak still open in one resource is never hidden by a verdict from
// another. Between equal statuses the latest triage wins, as the most recent decision about the value.
const isSaferFinding = (a: TMergedFinding, b: TMergedFinding) => {
  const rankA = MERGED_STATUS_PRECEDENCE.indexOf(a.status);
  const rankB = MERGED_STATUS_PRECEDENCE.indexOf(b.status);
  if (rankA !== rankB) return rankA < rankB;
  return (a.triagedAt?.getTime() ?? -Infinity) > (b.triagedAt?.getTime() ?? -Infinity);
};

export const secretScanningV2DALFactory = (db: TDbClient) => {
  const dataSourceOrm = ormify(db, TableName.SecretScanningDataSource);
  const resourceOrm = ormify(db, TableName.SecretScanningResource);
  const scanOrm = ormify(db, TableName.SecretScanningScan);
  const findingOrm = ormify(db, TableName.SecretScanningFinding);
  const configOrm = ormify(db, TableName.SecretScanningConfig);

  const findingLocationsQuery = (
    subQuery: Knex.QueryBuilder,
    { resourceId, dataSourceId, scanId }: { resourceId?: string; dataSourceId?: string; scanId?: string } = {}
  ) => {
    void subQuery
      .select(db.raw("1"))
      .from(TableName.SecretScanningFindingLocation)
      .whereRaw("?? = ??", [
        `${TableName.SecretScanningFindingLocation}.findingId`,
        `${TableName.SecretScanningFinding}.id`
      ]);
    if (resourceId) void subQuery.where(`${TableName.SecretScanningFindingLocation}.resourceId`, resourceId);
    if (dataSourceId) {
      void subQuery.whereIn(`${TableName.SecretScanningFindingLocation}.resourceId`, (resources) => {
        void resources.select("id").from(TableName.SecretScanningResource).where({ dataSourceId });
      });
    }
    if (scanId) void subQuery.where(`${TableName.SecretScanningFindingLocation}.scanId`, scanId);
  };

  const whereFindingInResource = (
    query: Knex.QueryBuilder,
    scope: { resourceId: string } | { dataSourceId: string }
  ) => {
    void query.where((inScope) => {
      void inScope
        .whereExists((subQuery) => findingLocationsQuery(subQuery, scope))
        .orWhere((unlocated) => {
          if ("resourceId" in scope)
            void unlocated.where(`${TableName.SecretScanningFinding}.resourceId`, scope.resourceId);
          else {
            void unlocated.whereIn(`${TableName.SecretScanningFinding}.resourceId`, (resources) => {
              void resources
                .select("id")
                .from(TableName.SecretScanningResource)
                .where({ dataSourceId: scope.dataSourceId });
            });
          }
          void unlocated.whereNotExists((subQuery) => findingLocationsQuery(subQuery));
        });
    });
  };

  // Postgres has a hard limit of how many itens can be upserted, so to prevent
  // issues in very large repositories with lots of findings, we should batch
  // the inserts to prevent the worker from exiting and failing the scan.
  const FINDINGS_UPSERT_CHUNK_SIZE = 1000;

  /**
   * Merges findings from before blind indexes existed, which a scan just matched again and so knows the value of, into
   * their value's finding, with the rules of the merge migration
   * (`20261126120000_merge-secret-scanning-findings-across-resources.ts`). A value with no finding yet takes the oldest
   * of them. Returns the finding each merged one went into, and the findings the merge reopened.
   */
  const mergeLegacyFindings = async (
    {
      scanId,
      blindIndexByLegacyFindingId,
      findingByBlindIndex
    }: {
      scanId: string;
      blindIndexByLegacyFindingId: Map<string, string>;
      findingByBlindIndex: Map<string, Pick<TSecretScanningFindings, "id" | "status">>;
    },
    tx: Knex
  ) => {
    // Every finding the scan goes on to lock is locked here, in one id order, so the scan never takes a lower id after a
    // higher one.
    const lockIds = [
      ...new Set([...blindIndexByLegacyFindingId.keys(), ...[...findingByBlindIndex.values()].map(({ id }) => id)])
    ].sort();

    const findingById = new Map<string, TMergedFinding>();
    for (const chunk of chunkArray(lockIds, FINDINGS_UPSERT_CHUNK_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      const findings = await tx(TableName.SecretScanningFinding)
        .whereIn("id", chunk)
        .orderBy("id")
        .forUpdate()
        .select(
          "id",
          "resourceId",
          "scanId",
          "rule",
          "status",
          "triagedAt",
          "triagedByUserId",
          "triageComment",
          "resolvedAt",
          "lastDetectedAt",
          "createdAt"
        );
      findings.forEach((finding) => findingById.set(finding.id, finding));
    }
    // A resource delete from the release before this one takes no advisory lock, so a finding read before the lock can
    // be gone; its value is then treated as having no finding.
    findingByBlindIndex.forEach(({ id }, blindIndex) => {
      const finding = findingById.get(id);
      if (finding) findingByBlindIndex.set(blindIndex, { id, status: finding.status });
      else findingByBlindIndex.delete(blindIndex);
    });

    const legacyFindings = [...blindIndexByLegacyFindingId.keys()]
      .flatMap((id) => findingById.get(id) ?? [])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

    const mergedIntoById = new Map<string, string>();
    const losersByWinnerId = new Map<string, TMergedFinding[]>();
    const stamped: { id: string; blindIndex: string }[] = [];
    legacyFindings.forEach((finding) => {
      const blindIndex = blindIndexByLegacyFindingId.get(finding.id)!;
      const winner = findingByBlindIndex.get(blindIndex);
      if (winner) {
        mergedIntoById.set(finding.id, winner.id);
        losersByWinnerId.set(winner.id, [...(losersByWinnerId.get(winner.id) ?? []), finding]);
      } else {
        stamped.push({ id: finding.id, blindIndex });
        findingByBlindIndex.set(blindIndex, { id: finding.id, status: finding.status });
      }
    });

    for (const chunk of chunkArray(stamped, FINDINGS_UPSERT_CHUNK_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      await tx.raw(
        `UPDATE ?? AS f SET "secretFindingBlindIndex" = v."blindIndex"
         FROM unnest(?::uuid[], ?::text[]) AS v(id, "blindIndex")
         WHERE f.id = v.id`,
        [TableName.SecretScanningFinding, chunk.map(({ id }) => id), chunk.map(({ blindIndex }) => blindIndex)]
      );
    }

    const reopenedFindings: Pick<TSecretScanningFindings, "id" | "rule">[] = [];
    if (!mergedIntoById.size) return { mergedIntoById, reopenedFindings };

    const loserIds = [...mergedIntoById.keys()];
    const resourceNameById = new Map<string, string>();
    for (const chunk of chunkArray(
      [...new Set([...findingById.values()].map(({ resourceId }) => resourceId))],
      FINDINGS_UPSERT_CHUNK_SIZE
    )) {
      // eslint-disable-next-line no-await-in-loop
      const resources = await tx(TableName.SecretScanningResource).whereIn("id", chunk).select("id", "name");
      resources.forEach(({ id, name }) => resourceNameById.set(id, name));
    }

    const winners = [...losersByWinnerId].map(([winnerId, losers]) => {
      const winner = findingById.get(winnerId)!;
      // A finding this scan created and nobody triaged is only the value's newer places, so the merge gives what saving
      // them on the legacy finding would have: its verdict stands, and a resolved one is reopened by them.
      const isFromThisScan = winner.scanId === scanId && !winner.triagedAt;
      const candidates = isFromThisScan ? losers : [winner, ...losers];
      const verdict = candidates.reduce((best, finding) => (isSaferFinding(finding, best) ? finding : best));
      const isReopened = isFromThisScan && verdict.status === SecretScanningFindingStatus.Resolved;
      const notes = candidates
        .filter(
          (finding): finding is TMergedFinding & { triagedAt: Date } =>
            finding !== verdict && Boolean(finding.triagedAt)
        )
        .sort((a, b) => a.triagedAt.getTime() - b.triagedAt.getTime())
        .map(
          ({ resourceId, status, triagedAt, triageComment }) =>
            `Merged from ${resourceNameById.get(resourceId)}: ${MERGED_STATUS_LABEL[status as SecretScanningFindingStatus]} on ${triagedAt
              .toISOString()
              .slice(0, 10)}${triageComment ? `: ${triageComment}` : ""}`
        );

      if (isReopened) reopenedFindings.push({ id: winner.id, rule: winner.rule });
      return {
        id: winner.id,
        verdictId: verdict.id,
        status: isReopened ? SecretScanningFindingStatus.Unresolved : verdict.status,
        triageComment: [verdict.triageComment, notes.join("\n")].filter(Boolean).join("\n\n") || null,
        memberIds: [winner.id, ...losers.map(({ id }) => id)]
      };
    });

    for (const chunk of chunkArray(loserIds, FINDINGS_UPSERT_CHUNK_SIZE)) {
      // A pull request check saved finding ids, so a merged-away finding's id lives on as the id of its oldest location,
      // which findByIdsOrLocationIdsForUpdate resolves.
      // eslint-disable-next-line no-await-in-loop
      await tx.raw(
        `UPDATE ?? AS l SET id = o."findingId"
         FROM (
           SELECT DISTINCT ON (x."findingId") x.id, x."findingId"
           FROM ?? AS x
           WHERE x."findingId" = ANY(?::uuid[])
             AND NOT EXISTS (SELECT 1 FROM ?? AS t WHERE t.id = x."findingId")
           ORDER BY x."findingId", x."createdAt", x.id
         ) AS o
         WHERE l.id = o.id`,
        [
          TableName.SecretScanningFindingLocation,
          TableName.SecretScanningFindingLocation,
          chunk,
          TableName.SecretScanningFindingLocation
        ]
      );

      // eslint-disable-next-line no-await-in-loop
      await tx.raw(
        `UPDATE ?? AS l SET "findingId" = v.winner
         FROM unnest(?::uuid[], ?::uuid[]) AS v(loser, winner)
         WHERE l."findingId" = v.loser`,
        [TableName.SecretScanningFindingLocation, chunk, chunk.map((id) => mergedIntoById.get(id)!)]
      );
    }

    for (const chunk of chunkArray(winners, FINDINGS_UPSERT_CHUNK_SIZE)) {
      const members = chunk.flatMap(({ id, memberIds }) => memberIds.map((memberId) => ({ id, memberId })));
      // The timestamps are copied in SQL, since a JS Date would drop their microseconds.
      // eslint-disable-next-line no-await-in-loop
      await tx.raw(
        `UPDATE ?? AS w
         SET status = m.status,
           "resolvedAt" = CASE WHEN m.status = v.status THEN v."resolvedAt" END,
           "triagedAt" = v."triagedAt",
           "triagedByUserId" = v."triagedByUserId",
           "triageComment" = m."triageComment",
           "createdAt" = d."createdAt",
           "lastDetectedAt" = d."lastDetectedAt"
         FROM unnest(?::uuid[], ?::uuid[], ?::text[], ?::text[]) AS m(id, "verdictId", status, "triageComment")
         JOIN ?? AS v ON v.id = m."verdictId"
         JOIN (
           SELECT g.id, min(f."createdAt") AS "createdAt", max(f."lastDetectedAt") AS "lastDetectedAt"
           FROM unnest(?::uuid[], ?::uuid[]) AS g(id, "memberId")
           JOIN ?? AS f ON f.id = g."memberId"
           GROUP BY g.id
         ) AS d ON d.id = m.id
         WHERE w.id = m.id`,
        [
          TableName.SecretScanningFinding,
          chunk.map(({ id }) => id),
          chunk.map(({ verdictId }) => verdictId),
          chunk.map(({ status }) => status),
          chunk.map(({ triageComment }) => triageComment),
          TableName.SecretScanningFinding,
          members.map(({ id }) => id),
          members.map(({ memberId }) => memberId),
          TableName.SecretScanningFinding
        ]
      );
    }

    for (const chunk of chunkArray(loserIds, FINDINGS_UPSERT_CHUNK_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      await tx(TableName.SecretScanningFinding).whereIn("id", chunk).delete();
    }

    const statusById = new Map(winners.map(({ id, status }) => [id, status]));
    findingByBlindIndex.forEach(({ id }, blindIndex) => {
      const status = statusById.get(id);
      if (status) findingByBlindIndex.set(blindIndex, { id, status });
    });

    return { mergedIntoById, reopenedFindings };
  };

  /**
   * Saves what a scan found in one resource. A finding is one secret value in the project, across its resources, and
   * each place it was found is a location of it. A location the resource already has is left as it is, so rescanning
   * history changes nothing. A new location creates its value's finding, or reopens it if it was resolved, since the
   * value turning up somewhere new after it was resolved is a regression. False positives and ignored findings only gain
   * the location.
   *
   * Returns every row's finding, including rows an earlier scan saved, and the findings this call reopened.
   */
  const persistFindingLocations = async (
    {
      projectId,
      resourceId,
      scanId,
      rows
    }: { projectId: string; resourceId: string; scanId: string; rows: TFindingLocationRow[] },
    tx: Knex
  ) => {
    try {
      // A diff scan can overlap a full scan of the same resource. Without this, both could miss a value's finding and each
      // create one, splitting the value in two, since nothing else keeps one finding per value; or both could take one
      // location as new, and the second would fail on the locations' unique index.
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretScanningFindingLocations(resourceId)]);

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
        if (!newRowByValue.has(valueKeyOf(row))) newRowByValue.set(valueKeyOf(row), row);
      });

      const newBlindIndexes = [...newRowByValue.values()].flatMap(({ secretFindingBlindIndex }) =>
        secretFindingBlindIndex ? [secretFindingBlindIndex] : []
      );

      const legacyFindingIds = new Set<string>();
      for (const chunk of chunkArray([...new Set(findingIdByFingerprint.values())], FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const legacy = await tx(TableName.SecretScanningFinding)
          .whereIn("id", chunk)
          .whereNull("secretFindingBlindIndex")
          .select("id");
        legacy.forEach(({ id }) => legacyFindingIds.add(id));
      }

      const blindIndexByLegacyFindingId = new Map<string, string>();
      rows.forEach(({ fingerprint, secretFindingBlindIndex }) => {
        const findingId = findingIdByFingerprint.get(fingerprint);
        if (findingId && secretFindingBlindIndex && legacyFindingIds.has(findingId)) {
          blindIndexByLegacyFindingId.set(findingId, secretFindingBlindIndex);
        }
      });

      const lookupBlindIndexes = [...new Set([...newBlindIndexes, ...blindIndexByLegacyFindingId.values()])];

      // A value's finding spans the project's resources, so scans of two resources could each miss it and create one
      // without this. Taken before anything is written, so a scan waiting here holds no row lock that a resource delete
      // holding this lock would wait on.
      if (lookupBlindIndexes.length) {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretScanningFindingValues(projectId)]);
      }

      // After a rollback a value can have several findings. The oldest takes the new locations, as the merge migration
      // keeps the oldest.
      const findingByBlindIndex = new Map<string, Pick<TSecretScanningFindings, "id" | "status">>();
      for (const chunk of chunkArray(lookupBlindIndexes, FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const findings = await tx(TableName.SecretScanningFinding)
          .whereIn("resourceId", (projectResources) => {
            void projectResources
              .select(`${TableName.SecretScanningResource}.id`)
              .from(TableName.SecretScanningResource)
              .join(
                TableName.SecretScanningDataSource,
                `${TableName.SecretScanningDataSource}.id`,
                `${TableName.SecretScanningResource}.dataSourceId`
              )
              .where(`${TableName.SecretScanningDataSource}.projectId`, projectId);
          })
          .whereIn("secretFindingBlindIndex", chunk)
          .orderBy("createdAt")
          .orderBy("id")
          .select("id", "status", "secretFindingBlindIndex");

        findings.forEach(({ id, status, secretFindingBlindIndex }) => {
          if (!findingByBlindIndex.has(secretFindingBlindIndex as string)) {
            findingByBlindIndex.set(secretFindingBlindIndex as string, { id, status });
          }
        });
      }

      const legacyMerge = blindIndexByLegacyFindingId.size
        ? await mergeLegacyFindings({ scanId, blindIndexByLegacyFindingId, findingByBlindIndex }, tx)
        : { mergedIntoById: new Map<string, string>(), reopenedFindings: [] };
      const { mergedIntoById } = legacyMerge;

      // Only values with a new location reopen their finding or count as detected, so the lookup above doesn't decide it.
      const findingByValue = new Map<string, Pick<TSecretScanningFindings, "id" | "status">>();
      newBlindIndexes.forEach((blindIndex) => {
        const finding = findingByBlindIndex.get(blindIndex);
        if (finding) findingByValue.set(blindIndex, finding);
      });

      const now = new Date();

      for (const chunk of chunkArray(
        [...newRowByValue.values()].filter((row) => !findingByValue.has(valueKeyOf(row))),
        FINDINGS_UPSERT_CHUNK_SIZE
      )) {
        // eslint-disable-next-line no-await-in-loop
        const created = await tx(TableName.SecretScanningFinding)
          .insert(
            // The first location is kept on the finding too, for the release before locations existed. Its scanId is
            // also how countNewUnresolvedByScanId knows which scan created the finding.
            chunk.map(({ secretFindingBlindIndex, rule, severity, fingerprint, details }) => ({
              resourceId,
              secretFindingBlindIndex,
              rule,
              severity,
              lastDetectedAt: now,
              scanId,
              fingerprint,
              details
            }))
          )
          .returning(["id", "status", "secretFindingBlindIndex", "fingerprint"]);

        created.forEach(({ id, status, secretFindingBlindIndex, fingerprint }) =>
          findingByValue.set(valueKeyOf({ secretFindingBlindIndex: secretFindingBlindIndex ?? null, fingerprint }), {
            id,
            status
          })
        );
      }

      const reopenedFindings: Pick<TSecretScanningFindings, "id" | "rule">[] = [...legacyMerge.reopenedFindings];

      // Locked in id order, as everything else that locks several findings does, so two writers can't each hold a
      // finding the other is waiting for.
      const lockOrder = [...new Set([...findingByValue.values()].map(({ id }) => id))].sort();

      for (const chunk of chunkArray(lockOrder, FINDINGS_UPSERT_CHUNK_SIZE)) {
        // Triage doesn't take the advisory lock, so a status read above can predate one. Read under the row lock, which
        // holds until commit, so the status returned is the one the pull request check has to see.
        // eslint-disable-next-line no-await-in-loop
        const locked = await tx(TableName.SecretScanningFinding)
          .whereIn("id", chunk)
          .orderBy("id")
          .forUpdate()
          .select("id", "status");

        const statusById = new Map(locked.map(({ id, status }) => [id, status]));
        findingByValue.forEach((finding, value) => {
          const status = statusById.get(finding.id);
          if (status) findingByValue.set(value, { ...finding, status });
        });

        // eslint-disable-next-line no-await-in-loop
        await tx(TableName.SecretScanningFinding).whereIn("id", chunk).update({ lastDetectedAt: now });

        // eslint-disable-next-line no-await-in-loop
        const reopened = await tx(TableName.SecretScanningFinding)
          .whereIn("id", chunk)
          .where("status", SecretScanningFindingStatus.Resolved)
          .update({ status: SecretScanningFindingStatus.Unresolved, resolvedAt: null })
          .returning(["id", "rule"]);

        reopenedFindings.push(...reopened);
      }

      for (const chunk of chunkArray(newRows, FINDINGS_UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await tx(TableName.SecretScanningFindingLocation).insert(
          chunk.map(({ fingerprint, rule, details, secretFindingBlindIndex }) => ({
            findingId: findingByValue.get(valueKeyOf({ secretFindingBlindIndex, fingerprint }))!.id,
            resourceId,
            scanId,
            fingerprint,
            rule,
            details
          }))
        );
      }

      const findingIdOf = (fingerprint: string) => {
        const findingId = findingIdByFingerprint.get(fingerprint);
        return findingId && (mergedIntoById.get(findingId) ?? findingId);
      };

      // A location saved before may belong to a finding from before blind indexes existed, so it's found by its id.
      const findingById = new Map<string, Pick<TSecretScanningFindings, "id" | "status">>();
      for (const chunk of chunkArray(
        [...new Set(rows.flatMap(({ fingerprint }) => findingIdOf(fingerprint) || []))],
        FINDINGS_UPSERT_CHUNK_SIZE
      )) {
        // eslint-disable-next-line no-await-in-loop
        const findings = await tx(TableName.SecretScanningFinding).whereIn("id", chunk).select("id", "status");

        findings.forEach((finding) => findingById.set(finding.id, finding));
      }

      const reopenedIds = new Set(reopenedFindings.map(({ id }) => id));

      const scannedLocations: TSecretScanningScannedLocation[] = rows.map(({ fingerprint, rule, details, ...row }) => {
        const existingFindingId = findingIdOf(fingerprint);
        const finding = existingFindingId
          ? findingById.get(existingFindingId)!
          : findingByValue.get(valueKeyOf({ secretFindingBlindIndex: row.secretFindingBlindIndex, fingerprint }))!;
        const status = reopenedIds.has(finding.id) ? SecretScanningFindingStatus.Unresolved : finding.status;

        return { id: finding.id, status, fingerprint, rule, details, isNew: !existingFindingId };
      });

      return { scannedLocations, reopenedFindings };
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

      const [resourceCounts, unresolvedFindingCounts, unresolvedUnlocatedFindingCounts] = await Promise.all([
        (tx || db.replicaNode())(TableName.SecretScanningResource)
          .whereIn("dataSourceId", dataSourceIds)
          .groupBy("dataSourceId")
          .select("dataSourceId")
          .count({ count: "*" }),
        (tx || db.replicaNode())(TableName.SecretScanningFindingLocation)
          .join(
            TableName.SecretScanningFinding,
            `${TableName.SecretScanningFinding}.id`,
            `${TableName.SecretScanningFindingLocation}.findingId`
          )
          .join(
            TableName.SecretScanningResource,
            `${TableName.SecretScanningResource}.id`,
            `${TableName.SecretScanningFindingLocation}.resourceId`
          )
          .whereIn(`${TableName.SecretScanningResource}.dataSourceId`, dataSourceIds)
          .where(`${TableName.SecretScanningFinding}.status`, SecretScanningFindingStatus.Unresolved)
          .groupBy(`${TableName.SecretScanningResource}.dataSourceId`)
          .select(`${TableName.SecretScanningResource}.dataSourceId`)
          .countDistinct({ count: `${TableName.SecretScanningFinding}.id` }),
        (tx || db.replicaNode())(TableName.SecretScanningFinding)
          .join(
            TableName.SecretScanningResource,
            `${TableName.SecretScanningResource}.id`,
            `${TableName.SecretScanningFinding}.resourceId`
          )
          .whereIn(`${TableName.SecretScanningResource}.dataSourceId`, dataSourceIds)
          .where(`${TableName.SecretScanningFinding}.status`, SecretScanningFindingStatus.Unresolved)
          .whereNotExists((subQuery) => findingLocationsQuery(subQuery))
          .groupBy(`${TableName.SecretScanningResource}.dataSourceId`)
          .select(`${TableName.SecretScanningResource}.dataSourceId`)
          .count({ count: "*" })
      ]);

      const resourceCountByDataSourceId = new Map(
        resourceCounts.map(({ dataSourceId, count }) => [dataSourceId, Number(count)])
      );
      const unresolvedFindingCountByDataSourceId = new Map<string, number>();
      (
        [unresolvedFindingCounts, unresolvedUnlocatedFindingCounts] as {
          dataSourceId: string;
          count: string | number;
        }[][]
      )
        .flat()
        .forEach(({ dataSourceId, count }) =>
          unresolvedFindingCountByDataSourceId.set(
            dataSourceId,
            (unresolvedFindingCountByDataSourceId.get(dataSourceId) ?? 0) + Number(count)
          )
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
          `LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS "count" FROM ?? AS f
             WHERE f."status" = ? AND f.id IN (
               SELECT l."findingId" FROM ?? AS l WHERE l."resourceId" = ??.id
               UNION ALL
               SELECT u.id FROM ?? AS u
               WHERE u."resourceId" = ??.id AND NOT EXISTS (SELECT 1 FROM ?? AS ul WHERE ul."findingId" = u.id)
             )
           ) AS "unresolved" ON TRUE`,
          [
            TableName.SecretScanningFinding,
            SecretScanningFindingStatus.Unresolved,
            TableName.SecretScanningFindingLocation,
            TableName.SecretScanningResource,
            TableName.SecretScanningFinding,
            TableName.SecretScanningResource,
            TableName.SecretScanningFindingLocation
          ]
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

  // Both transitions are guarded on the scan's current status, so a scan something else already closed keeps its
  // outcome. They return whether this call closed it.
  const markScanCompleted = async ({ scanId, metadata }: { scanId: string; metadata?: unknown }, tx?: Knex) => {
    const completed = await scanOrm.update(
      { id: scanId, status: SecretScanningScanStatus.Scanning },
      {
        status: SecretScanningScanStatus.Completed,
        statusMessage: null,
        completedAt: new Date(),
        ...(metadata === undefined ? {} : { metadata })
      },
      tx
    );

    return completed.length > 0;
  };

  const markScanFailed = async (
    {
      scanId,
      statusMessage,
      fromStatuses
    }: { scanId: string; statusMessage: string; fromStatuses: SecretScanningScanStatus[] },
    tx?: Knex
  ) => {
    const failed = await scanOrm.update(
      { id: scanId, $in: { status: fromStatuses } },
      {
        status: SecretScanningScanStatus.Failed,
        statusMessage,
        completedAt: new Date()
      },
      tx
    );

    return failed.length > 0;
  };

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

  // The filtered resource (or the scan's) comes first in `resources`, so a link from its alert or pull request check
  // opens on it.
  const findingWithDetailsQuery = (
    tx?: Knex,
    { resourceId = null, dataSourceId = null, scanId = null }: TFindingResourceOrder = {}
  ) =>
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
        ]),
        db.raw(
          `COALESCE(
             (
               SELECT json_agg(
                 json_build_object(
                   'id', r.id, 'name', r.name, 'dataSourceId', ds.id, 'dataSourceName', ds.name,
                   'dataSourceType', ds.type, 'locationCount', lc.count
                 )
                 ORDER BY r.id = COALESCE(?::uuid, (SELECT s."resourceId" FROM ?? AS s WHERE s.id = ?::uuid)) DESC NULLS LAST,
                   ds.id = ?::uuid DESC NULLS LAST, lc.count DESC, r.name, r.id
               )
               FROM (SELECT l."resourceId", count(*)::int AS count FROM ?? AS l WHERE l."findingId" = ?? GROUP BY l."resourceId") AS lc
               JOIN ?? AS r ON r.id = lc."resourceId"
               JOIN ?? AS ds ON ds.id = r."dataSourceId"
             ),
             json_build_array(json_build_object(
               'id', ??, 'name', ??, 'dataSourceId', ??, 'dataSourceName', ??, 'dataSourceType', ??, 'locationCount', 0
             ))
           ) AS "resources"`,
          [
            resourceId,
            TableName.SecretScanningScan,
            scanId,
            dataSourceId,
            TableName.SecretScanningFindingLocation,
            `${TableName.SecretScanningFinding}.id`,
            TableName.SecretScanningResource,
            TableName.SecretScanningDataSource,
            `${TableName.SecretScanningResource}.id`,
            `${TableName.SecretScanningResource}.name`,
            `${TableName.SecretScanningDataSource}.id`,
            `${TableName.SecretScanningDataSource}.name`,
            `${TableName.SecretScanningDataSource}.type`
          ]
        )
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
    if (resourceId) whereFindingInResource(query, { resourceId });
    if (dataSourceId) whereFindingInResource(query, { dataSourceId });
    // the findings the scan found a new location of
    if (scanId) void query.whereExists((subQuery) => findingLocationsQuery(subQuery, { scanId }));
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
      case SecretScanningFindingOrderBy.Author:
        void query.orderByRaw(`??->>'author' ${direction}`, [`${TableName.SecretScanningFinding}.details`]);
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
      case SecretScanningFindingOrderBy.LocationCount:
        void query.orderByRaw(`(SELECT count(*) FROM ?? AS l WHERE l."findingId" = ??) ${direction}`, [
          TableName.SecretScanningFindingLocation,
          `${TableName.SecretScanningFinding}.id`
        ]);
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
        applyFindingFilters(findingWithDetailsQuery(tx, filter), projectId, filter),
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
        findings: findings as ((typeof findings)[number] & {
          locationCount: number;
          resources: TSecretScanningFindingResource[];
        })[],
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

      return finding as
        | (typeof finding & {
            locationCount: number;
            resources: TSecretScanningFindingResource[];
          })
        | undefined;
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

  // detachResources can point an older finding's scanId at a later scan, so a finding created before the scan began
  // is never one it created.
  const countNewUnresolvedByScanId = async (scanId: string, tx?: Knex) => {
    try {
      const [result] = (await (tx || db)(TableName.SecretScanningFinding)
        .where({ scanId, status: SecretScanningFindingStatus.Unresolved })
        .whereRaw(`"createdAt" >= (SELECT s."createdAt" FROM ?? AS s WHERE s.id = ?)`, [
          TableName.SecretScanningScan,
          scanId
        ])
        .count("* as count")) as { count: string }[];

      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count New Unresolved By Scan ID - Secret Scanning Finding" });
    }
  };

  // A pull request check that ran before findings were merged saved ids of findings that are now locations of another
  // finding, under the same ids.
  const findFindingsByIdsOrLocationIdsForUpdate = async (resourceId: string, ids: string[], tx: Knex) => {
    try {
      return await tx(TableName.SecretScanningFinding)
        .where((qb) => {
          void qb
            .where((byFindingId) => {
              void byFindingId.whereRaw("?? = ANY(?::uuid[])", ["id", ids]);
              whereFindingInResource(byFindingId, { resourceId });
            })
            .orWhereIn("id", (subQuery) => {
              void subQuery
                .select("findingId")
                .from(TableName.SecretScanningFindingLocation)
                .whereRaw("?? = ANY(?::uuid[])", ["id", ids])
                .where({ resourceId });
            });
        })
        .orderBy("id")
        .forUpdate();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By IDs Or Location IDs For Update - Secret Scanning Finding" });
    }
  };

  // A scan can merge a finding away while a request for it is in flight, and its id lives on as one of its locations.
  const findFindingByIdOrLocationIdForUpdate = async (id: string, tx: Knex) => {
    try {
      return await tx(TableName.SecretScanningFinding)
        .where("id", id)
        .orWhereIn("id", (subQuery) => {
          void subQuery.select("findingId").from(TableName.SecretScanningFindingLocation).where({ id });
        })
        .orderBy("id")
        .forUpdate()
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By ID Or Location ID For Update - Secret Scanning Finding" });
    }
  };

  // Must run in a resource or data source delete's transaction before the delete: a finding still found elsewhere is
  // pointed off the deleted resources, or the cascade through its resourceId and scanId would delete it.
  const detachFindingResources = async (
    scope: { projectId: string } & ({ resourceIds: string[] } | { dataSourceId: string }),
    tx: Knex
  ) => {
    try {
      // Only this lock, never a resource's: scans take a resource's lock and then this one, so waiting on a resource's
      // lock while holding this one could deadlock with them.
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretScanningFindingValues(scope.projectId)]);

      // Read under the lock, which a scan holds while it saves a resource's findings, so no resource with findings is
      // missed and left to the cascade.
      const resourceIds =
        "resourceIds" in scope
          ? scope.resourceIds
          : (await tx(TableName.SecretScanningResource).where({ dataSourceId: scope.dataSourceId }).select("id")).map(
              ({ id }) => id
            );
      if (!resourceIds.length) return;

      const findings = await tx(TableName.SecretScanningFinding)
        .where((qb) => {
          void qb.whereRaw("?? = ANY(?::uuid[])", ["resourceId", resourceIds]).orWhereIn("id", (subQuery) => {
            void subQuery
              .select("findingId")
              .from(TableName.SecretScanningFindingLocation)
              .whereRaw("?? = ANY(?::uuid[])", ["resourceId", resourceIds]);
          });
        })
        .orderBy("id")
        .forUpdate()
        .select("id");
      const findingIds = findings.map(({ id }) => id);

      await tx(TableName.SecretScanningFindingLocation)
        .whereRaw("?? = ANY(?::uuid[])", ["resourceId", resourceIds])
        .delete();

      await tx(TableName.SecretScanningFinding)
        .whereRaw("?? = ANY(?::uuid[])", [`${TableName.SecretScanningFinding}.id`, findingIds])
        .whereNotExists((subQuery) => findingLocationsQuery(subQuery))
        .delete();

      await tx.raw(
        `UPDATE ?? AS f
         SET "resourceId" = l."resourceId", "scanId" = l."scanId", fingerprint = l.fingerprint, details = l.details
         FROM (
           SELECT DISTINCT ON (l."findingId") l."findingId", l."resourceId", l."scanId", l.fingerprint, l.details
           FROM ?? AS l
           JOIN ?? AS s ON s.id = l."scanId"
           WHERE l."findingId" = ANY(?::uuid[])
           ORDER BY l."findingId", (s.status = ?) DESC, l."createdAt", l.id
         ) AS l
         WHERE f.id = l."findingId" AND f."resourceId" = ANY(?::uuid[])`,
        [
          TableName.SecretScanningFinding,
          TableName.SecretScanningFindingLocation,
          TableName.SecretScanningScan,
          findingIds,
          SecretScanningScanStatus.Completed,
          resourceIds
        ]
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Detach Resources - Secret Scanning Finding" });
    }
  };

  // Ordered newest first, which is the order a finding's locations are shown in.
  const findLocationsByFindingId = async (
    findingId: string,
    { resourceId, offset, limit }: { resourceId?: string; offset: number; limit: number },
    tx?: Knex
  ) => {
    try {
      const baseQuery = (tx || db.replicaNode())(TableName.SecretScanningFindingLocation).where(
        `${TableName.SecretScanningFindingLocation}.findingId`,
        findingId
      );
      if (resourceId) void baseQuery.where(`${TableName.SecretScanningFindingLocation}.resourceId`, resourceId);

      const [locations, countResult] = await Promise.all([
        baseQuery
          .clone()
          .join(
            TableName.SecretScanningResource,
            `${TableName.SecretScanningResource}.id`,
            `${TableName.SecretScanningFindingLocation}.resourceId`
          )
          .select(selectAllTableCols(TableName.SecretScanningFindingLocation))
          .select(db.ref("name").withSchema(TableName.SecretScanningResource).as("resourceName"))
          .orderBy(`${TableName.SecretScanningFindingLocation}.createdAt`, "desc")
          .orderBy(`${TableName.SecretScanningFindingLocation}.id`, "desc")
          .offset(offset)
          .limit(limit),
        baseQuery.clone().count({ count: "*" }).first()
      ]);

      return { locations, totalCount: Number(countResult?.count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Finding ID - Secret Scanning Finding Location" });
    }
  };

  const findLocationResourcesByFindingIds = async (findingIds: string[], tx?: Knex) => {
    if (!findingIds.length) return [];

    try {
      return (await (tx || db.replicaNode())(TableName.SecretScanningFindingLocation)
        .join(
          TableName.SecretScanningResource,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningFindingLocation}.resourceId`
        )
        .whereRaw("?? = ANY(?::uuid[])", [`${TableName.SecretScanningFindingLocation}.findingId`, findingIds])
        .distinct(
          `${TableName.SecretScanningFindingLocation}.findingId`,
          `${TableName.SecretScanningResource}.id`,
          `${TableName.SecretScanningResource}.name`
        )) as { findingId: string; id: string; name: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Resources By Finding IDs - Secret Scanning Finding Location" });
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
      markCompleted: markScanCompleted,
      markFailed: markScanFailed,
      findQueuedHistorical: findQueuedHistoricalScans
    },
    findings: {
      ...findingOrm,
      persistLocations: persistFindingLocations,
      detachResources: detachFindingResources,
      findByIdsOrLocationIdsForUpdate: findFindingsByIdsOrLocationIdsForUpdate,
      findByIdOrLocationIdForUpdate: findFindingByIdOrLocationIdForUpdate,
      countByScanId: countFindingsByScanId,
      countNewUnresolvedByScanId,
      findByProjectId: findFindingsByProjectId,
      findByIdWithDetails: findFindingByIdWithDetails,
      countByProjectId: countFindingsByProjectId
    },
    locations: {
      findByFindingId: findLocationsByFindingId,
      findResourcesByFindingIds: findLocationResourcesByFindingIds
    },
    configs: configOrm
  };
};
