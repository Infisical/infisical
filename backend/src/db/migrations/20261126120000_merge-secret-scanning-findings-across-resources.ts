import { Knex } from "knex";

import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { PgSqlLock } from "@app/keystore/keystore";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;
const RESOURCE = TableName.SecretScanningResource;
const DATA_SOURCE = TableName.SecretScanningDataSource;

const BATCH_LOCATIONS = 20_000;
const STATEMENT_TIMEOUT_MS = 10 * 60 * 1000;

const STATUS_PRECEDENCE = [
  SecretScanningFindingStatus.Unresolved,
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.Ignore,
  SecretScanningFindingStatus.FalsePositive
];

const STATUS_LABEL: Record<string, string> = {
  [SecretScanningFindingStatus.Unresolved]: "unresolved",
  [SecretScanningFindingStatus.Resolved]: "resolved",
  [SecretScanningFindingStatus.Ignore]: "ignored",
  [SecretScanningFindingStatus.FalsePositive]: "false positive"
};

type TValue = { projectId: string; blindIndex: string; locationCount: number; resourceIds: string[] };

const lockAll = (tx: Knex, keys: number[]) =>
  tx.raw("SELECT pg_advisory_xact_lock(k) FROM unnest(?::bigint[]) AS k", [keys]);

const mergeBatch = async (tx: Knex, values: TValue[]) => {
  const resourceIds = [...new Set(values.flatMap((value) => value.resourceIds))].sort();
  const projectIds = [...new Set(values.map((value) => value.projectId))].sort();

  await tx.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

  // Resources before projects, as scans take them. A scan of the previous release takes only its resource's lock, so
  // the batch merges only findings named after resources it locked.
  await lockAll(tx, resourceIds.map(PgSqlLock.SecretScanningFindingLocations));
  await lockAll(tx, projectIds.map(PgSqlLock.SecretScanningFindingValues));

  await tx.raw(
    `CREATE TEMPORARY TABLE finding_merge ON COMMIT DROP AS
     SELECT f.id, f.status, f."triagedAt", f."triagedByUserId", f."triageComment", f."resolvedAt", f."createdAt",
       f."lastDetectedAt", r.name AS "resourceName",
       first_value(f.id) OVER (
         PARTITION BY ds."projectId", f."secretFindingBlindIndex" ORDER BY f."createdAt", f.id
       ) AS "winnerId"
     FROM ?? AS f
     JOIN ?? AS r ON r.id = f."resourceId"
     JOIN ?? AS ds ON ds.id = r."dataSourceId"
     WHERE (ds."projectId", f."secretFindingBlindIndex") IN (SELECT * FROM unnest(?::text[], ?::text[]))
       AND f."resourceId" = ANY(?::uuid[])`,
    [
      FINDING,
      RESOURCE,
      DATA_SOURCE,
      values.map(({ projectId }) => projectId),
      values.map(({ blindIndex }) => blindIndex),
      resourceIds
    ]
  );

  // A pull request check saved finding ids, so each merged-away finding's id lives on as the id of its oldest
  // location, which findings.findByIdsOrLocationIdsForUpdate resolves.
  await tx.raw(
    `UPDATE ?? AS l
     SET id = m.id
     FROM finding_merge AS m
     WHERE m.id <> m."winnerId"
       AND NOT EXISTS (SELECT 1 FROM ?? AS taken WHERE taken.id = m.id)
       AND l.id = (
         SELECT oldest.id FROM ?? AS oldest WHERE oldest."findingId" = m.id ORDER BY oldest."createdAt", oldest.id LIMIT 1
       )`,
    [LOCATION, LOCATION, LOCATION]
  );

  await tx.raw(
    `UPDATE ?? AS l SET "findingId" = m."winnerId"
     FROM finding_merge AS m
     WHERE l."findingId" = m.id AND m.id <> m."winnerId"`,
    [LOCATION]
  );

  await tx.raw(
    `WITH verdict AS (
       SELECT DISTINCT ON (m."winnerId") m."winnerId", m.id AS "sourceId", m.status, m."triagedAt", m."triagedByUserId",
         m."triageComment", m."resolvedAt"
       FROM finding_merge AS m
       ORDER BY m."winnerId", array_position(?::text[], m.status::text), m."triagedAt" DESC NULLS LAST, m."createdAt", m.id
     )
     UPDATE ?? AS f
     SET status = v.status,
       "resolvedAt" = v."resolvedAt",
       "triagedAt" = v."triagedAt",
       "triagedByUserId" = v."triagedByUserId",
       "triageComment" = NULLIF(concat_ws(E'\\n\\n', v."triageComment", notes.text), ''),
       "lastDetectedAt" = (SELECT max(m."lastDetectedAt") FROM finding_merge AS m WHERE m."winnerId" = v."winnerId")
     FROM verdict AS v
     JOIN LATERAL (
       SELECT string_agg(
         'Merged from ' || m."resourceName" || ': ' || (?::jsonb ->> m.status) || ' on '
           || to_char(m."triagedAt", 'YYYY-MM-DD') || COALESCE(': ' || m."triageComment", ''),
         E'\\n' ORDER BY m."triagedAt"
       ) AS text
       FROM finding_merge AS m
       WHERE m."winnerId" = v."winnerId" AND m.id <> v."sourceId" AND m."triagedAt" IS NOT NULL
     ) AS notes ON TRUE
     WHERE f.id = v."winnerId"
       AND EXISTS (SELECT 1 FROM finding_merge AS loser WHERE loser."winnerId" = v."winnerId" AND loser.id <> loser."winnerId")`,
    [STATUS_PRECEDENCE, FINDING, JSON.stringify(STATUS_LABEL)]
  );

  await tx.raw(`DELETE FROM ?? AS f USING finding_merge AS m WHERE f.id = m.id AND m.id <> m."winnerId"`, [FINDING]);
};

// One transaction per batch, so an interrupted run can start over.
export async function up(knex: Knex): Promise<void> {
  const { rows } = (await knex.raw(
    `WITH value AS (
       SELECT ds."projectId", f."secretFindingBlindIndex" AS "blindIndex", array_agg(f.id) AS "findingIds",
         array_agg(DISTINCT f."resourceId"::text) AS "resourceIds"
       FROM ?? AS f
       JOIN ?? AS r ON r.id = f."resourceId"
       JOIN ?? AS ds ON ds.id = r."dataSourceId"
       WHERE f."secretFindingBlindIndex" IS NOT NULL
       GROUP BY ds."projectId", f."secretFindingBlindIndex"
       HAVING count(*) > 1
     )
     SELECT v."projectId", v."blindIndex", v."resourceIds",
       (SELECT count(*)::int FROM ?? AS l WHERE l."findingId" = ANY(v."findingIds")) AS "locationCount"
     FROM value AS v
     ORDER BY v."projectId", v."blindIndex"`,
    [FINDING, RESOURCE, DATA_SOURCE, LOCATION]
  )) as { rows: TValue[] };

  const batches: TValue[][] = [];
  let batchLocations = 0;
  for (const value of rows) {
    if (!batches.length || batchLocations + value.locationCount > BATCH_LOCATIONS) {
      batches.push([]);
      batchLocations = 0;
    }
    batches[batches.length - 1].push(value);
    batchLocations += value.locationCount;
  }

  for (const batch of batches) {
    // eslint-disable-next-line no-await-in-loop
    await knex.transaction((tx) => mergeBatch(tx, batch));
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    await tx.raw(
      `CREATE TEMPORARY TABLE finding_split ON COMMIT DROP AS
       SELECT DISTINCT ON (l."findingId", l."resourceId")
         l."findingId", l."resourceId", gen_random_uuid() AS "newId", l."scanId", l.fingerprint, l.details, l."createdAt"
       FROM ?? AS l
       JOIN ?? AS f ON f.id = l."findingId"
       WHERE l."resourceId" <> f."resourceId"
       ORDER BY l."findingId", l."resourceId", l."createdAt", l.id`,
      [LOCATION, FINDING]
    );

    await tx.raw(
      `INSERT INTO ?? (
         id, "resourceId", "scanId", fingerprint, details, rule, severity, confidence, status, "triageComment",
         "triagedByUserId", "triagedAt", "resolvedAt", "secretFindingBlindIndex", "createdAt", "lastDetectedAt"
       )
       SELECT s."newId", s."resourceId", s."scanId", s.fingerprint, s.details, f.rule, f.severity, f.confidence, f.status,
         f."triageComment", f."triagedByUserId", f."triagedAt", f."resolvedAt", f."secretFindingBlindIndex", s."createdAt",
         f."lastDetectedAt"
       FROM finding_split AS s
       JOIN ?? AS f ON f.id = s."findingId"`,
      [FINDING, FINDING]
    );

    await tx.raw(
      `UPDATE ?? AS l SET "findingId" = s."newId"
       FROM finding_split AS s
       WHERE l."findingId" = s."findingId" AND l."resourceId" = s."resourceId"`,
      [LOCATION]
    );
  });
}

const config = { transaction: false };
export { config };
