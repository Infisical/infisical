import { Knex } from "knex";

import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { PgSqlLock } from "@app/keystore/keystore";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;
const RESOURCE = TableName.SecretScanningResource;
const DATA_SOURCE = TableName.SecretScanningDataSource;

const BATCH_LOCATIONS = 20_000;
const BATCH_RESOURCES = 500;
const STATEMENT_TIMEOUT_MS = 60_000;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_ATTEMPTS = 5;
const LOCK_RETRY_DELAY_MS = 5_000;
const LOCK_NOT_AVAILABLE = "55P03";

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
type TBatch = { values: TValue[]; projectIds: string[]; resourceIds: string[] };

// The findings of the batch's values, each with the finding its value merges into: the oldest, which is also the one
// scans give new locations to, so a finding created while this runs never takes over an established one.
const rankedFindingsSql = (batch: TBatch) => ({
  sql: `
    SELECT f.*, ds."projectId",
      first_value(f.id) OVER (
        PARTITION BY ds."projectId", f."secretFindingBlindIndex" ORDER BY f."createdAt", f.id
      ) AS "winnerId"
    FROM ?? AS f
    JOIN ?? AS r ON r.id = f."resourceId"
    JOIN ?? AS ds ON ds.id = r."dataSourceId"
    WHERE (ds."projectId", f."secretFindingBlindIndex") IN (SELECT * FROM unnest(?::text[], ?::text[]))`,
  bindings: [
    FINDING,
    RESOURCE,
    DATA_SOURCE,
    batch.values.map(({ projectId }) => projectId),
    batch.values.map(({ blindIndex }) => blindIndex)
  ] as Knex.RawBinding[]
});

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

// Each step is its own transaction holding the locks scans take, resources before the project, so no scan can add a
// location to a finding between the step moving it and the step deleting it. Scans of the release before this one only
// take the resource lock, and only touch findings that name their resource, which the batch's resources include. A
// lock held for long by a scan is waited out and retried rather than failing the migration at boot.
const runLocked = async (knex: Knex, batch: TBatch, step: (tx: Knex) => Promise<void>) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await knex.transaction(async (tx) => {
        await tx.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await tx.raw(`SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS}`);
        for (const resourceId of batch.resourceIds) {
          // eslint-disable-next-line no-await-in-loop
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretScanningFindingLocations(resourceId)]);
        }
        for (const projectId of batch.projectIds) {
          // eslint-disable-next-line no-await-in-loop
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretScanningFindingValues(projectId)]);
        }
        await step(tx);
      });
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== LOCK_NOT_AVAILABLE || attempt >= LOCK_ATTEMPTS) throw error;
      // eslint-disable-next-line no-await-in-loop
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }
};

const mergeBatch = async (knex: Knex, batch: TBatch) => {
  const ranked = rankedFindingsSql(batch);

  // A finding saved without a location (a copy the merge by value had no place for) gets one from the place it names
  // where that place is free, so it isn't lost with the finding. When the place is taken, it already is a location of
  // the value. A loser's id becomes the id of one of its locations, so ids a pull request check saved still resolve.
  await runLocked(knex, batch, async (tx) => {
    await tx.raw(
      `INSERT INTO ?? (id, "findingId", "resourceId", "scanId", fingerprint, rule, details, "createdAt")
       SELECT f.id, f.id, f."resourceId", f."scanId", f.fingerprint, f.rule, f.details, f."createdAt"
       FROM (${ranked.sql}) AS f
       WHERE NOT EXISTS (SELECT 1 FROM ?? AS l WHERE l."findingId" = f.id)
       ON CONFLICT DO NOTHING`,
      [LOCATION, ...ranked.bindings, LOCATION]
    );

    await tx.raw(
      `UPDATE ?? AS l
       SET id = f.id
       FROM (${ranked.sql}) AS f
       WHERE f.id <> f."winnerId"
         AND NOT EXISTS (SELECT 1 FROM ?? AS taken WHERE taken.id = f.id)
         AND l.id = (
           SELECT oldest.id FROM ?? AS oldest WHERE oldest."findingId" = f.id ORDER BY oldest."createdAt", oldest.id LIMIT 1
         )`,
      [LOCATION, ...ranked.bindings, LOCATION, LOCATION]
    );
  });

  // Moved a chunk at a time, so a value found in very many places can't hit the statement timeout.
  for (;;) {
    let moved = 0;
    // eslint-disable-next-line no-await-in-loop
    await runLocked(knex, batch, async (tx) => {
      const result = (await tx.raw(
        `UPDATE ?? AS l
         SET "findingId" = f."winnerId"
         FROM (${ranked.sql}) AS f
         WHERE l."findingId" = f.id AND f.id <> f."winnerId"
           AND l.id IN (
             SELECT chunk.id FROM ?? AS chunk
             WHERE chunk."findingId" IN (SELECT loser.id FROM (${ranked.sql}) AS loser WHERE loser.id <> loser."winnerId")
             LIMIT ?
           )`,
        [LOCATION, ...ranked.bindings, LOCATION, ...ranked.bindings, BATCH_LOCATIONS]
      )) as { rowCount: number };
      moved = result.rowCount;
    });
    if (!moved) break;
  }

  await runLocked(knex, batch, async (tx) => {
    // A loser nobody triaged that appeared after the winner was triaged is only a new place of the winner's value, as
    // if a scan had found it: it reopens a resolved winner and changes nothing else. That keeps a rerun from reopening a
    // false positive because of a copy an older release saved after it was triaged. Every other finding's status is a
    // verdict, and the safest one wins.
    await tx.raw(
      `CREATE TEMPORARY TABLE finding_merge ON COMMIT DROP AS
       SELECT f.id, f."winnerId", f.status, f."triagedAt", f."triagedByUserId", f."triageComment", f."resolvedAt",
         f."createdAt", f."lastDetectedAt", r.name AS "resourceName",
         (f.id <> f."winnerId" AND f."triagedAt" IS NULL AND w."triagedAt" IS NOT NULL AND f."createdAt" > w."triagedAt")
           AS "isLate"
       FROM (${ranked.sql}) AS f
       JOIN (${ranked.sql}) AS w ON w.id = f."winnerId"
       JOIN ?? AS r ON r.id = f."resourceId"`,
      [...ranked.bindings, ...ranked.bindings, RESOURCE]
    );

    await tx.raw(
      `CREATE TEMPORARY TABLE finding_merge_verdict ON COMMIT DROP AS
       SELECT DISTINCT ON (m."winnerId") m."winnerId", m.id AS "sourceId", m.status, m."triagedAt", m."triagedByUserId",
         m."triageComment", m."resolvedAt"
       FROM finding_merge AS m
       WHERE NOT m."isLate"
       ORDER BY m."winnerId", array_position(?::text[], m.status::text), m."triagedAt" DESC NULLS LAST, m."createdAt", m.id`,
      [STATUS_PRECEDENCE]
    );

    await tx.raw(
      `UPDATE ?? AS f
       SET status = CASE WHEN v.status = ? AND late."hasLate" THEN ? ELSE v.status END,
         "resolvedAt" = CASE WHEN v.status = ? AND late."hasLate" THEN NULL ELSE v."resolvedAt" END,
         "triagedAt" = v."triagedAt",
         "triagedByUserId" = v."triagedByUserId",
         "triageComment" = NULLIF(concat_ws(E'\\n\\n', v."triageComment", notes.text), ''),
         "lastDetectedAt" = late."lastDetectedAt"
       FROM finding_merge_verdict AS v
       JOIN LATERAL (
         SELECT bool_or(m."isLate") AS "hasLate", max(m."lastDetectedAt") AS "lastDetectedAt"
         FROM finding_merge AS m WHERE m."winnerId" = v."winnerId"
       ) AS late ON TRUE
       JOIN LATERAL (
         SELECT string_agg(
           'Merged from ' || m."resourceName" || ': ' || (?::jsonb ->> m.status) || ' on '
             || to_char(m."triagedAt", 'YYYY-MM-DD') || COALESCE(': ' || m."triageComment", ''),
           E'\\n' ORDER BY m."triagedAt"
         ) AS text
         FROM finding_merge AS m
         WHERE m."winnerId" = v."winnerId" AND m.id <> v."sourceId" AND NOT m."isLate" AND m."triagedAt" IS NOT NULL
       ) AS notes ON TRUE
       WHERE f.id = v."winnerId"`,
      [
        FINDING,
        SecretScanningFindingStatus.Resolved,
        SecretScanningFindingStatus.Unresolved,
        SecretScanningFindingStatus.Resolved,
        JSON.stringify(STATUS_LABEL)
      ]
    );

    // whatever a scan of the release before this one added to a loser since the last move
    await tx.raw(
      `UPDATE ?? AS l SET "findingId" = m."winnerId"
       FROM finding_merge AS m
       WHERE l."findingId" = m.id AND m.id <> m."winnerId"`,
      [LOCATION]
    );

    await tx.raw(`DELETE FROM ?? AS f USING finding_merge AS m WHERE f.id = m.id AND m.id <> m."winnerId"`, [FINDING]);
  });
};

// Values are packed into batches of about BATCH_LOCATIONS locations and BATCH_RESOURCES resources; a value bigger than
// that gets a batch of its own.
const packBatches = (values: TValue[]) => {
  const batches: TBatch[] = [];
  let current: { values: TValue[]; locations: number; projectIds: Set<string>; resourceIds: Set<string> } | null = null;

  const flush = () => {
    if (!current) return;
    batches.push({
      values: current.values,
      projectIds: [...current.projectIds].sort(),
      resourceIds: [...current.resourceIds].sort()
    });
    current = null;
  };

  for (const value of values) {
    if (
      current &&
      (current.locations + value.locationCount > BATCH_LOCATIONS ||
        new Set([...current.resourceIds, ...value.resourceIds]).size > BATCH_RESOURCES)
    ) {
      flush();
    }
    if (!current) current = { values: [], locations: 0, projectIds: new Set(), resourceIds: new Set() };
    current.values.push(value);
    current.locations += value.locationCount;
    current.projectIds.add(value.projectId);
    for (const resourceId of value.resourceIds) current.resourceIds.add(resourceId);
  }
  flush();

  return batches;
};

// A finding becomes one secret value in a project instead of in one resource: the findings of a value in different
// resources merge into the oldest, with every location. Merging again changes nothing, so an interrupted run can start
// over, and a later release reruns this to fold in findings the release before this one saved while it rolled out.
export async function up(knex: Knex): Promise<void> {
  const { rows } = (await knex.raw(
    `WITH value AS (
       SELECT ds."projectId", f."secretFindingBlindIndex" AS "blindIndex", array_agg(f.id) AS "findingIds",
         array_agg(DISTINCT f."resourceId") AS "namedResourceIds"
       FROM ?? AS f
       JOIN ?? AS r ON r.id = f."resourceId"
       JOIN ?? AS ds ON ds.id = r."dataSourceId"
       WHERE f."secretFindingBlindIndex" IS NOT NULL
       GROUP BY ds."projectId", f."secretFindingBlindIndex"
       HAVING count(*) > 1
     )
     SELECT v."projectId", v."blindIndex",
       (SELECT count(*)::int FROM ?? AS l WHERE l."findingId" = ANY(v."findingIds")) AS "locationCount",
       ARRAY(
         SELECT DISTINCT resource_id::text FROM unnest(
           v."namedResourceIds" || ARRAY(SELECT l."resourceId" FROM ?? AS l WHERE l."findingId" = ANY(v."findingIds"))
         ) AS resource_id
       ) AS "resourceIds"
     FROM value AS v
     ORDER BY v."projectId", v."blindIndex"`,
    [FINDING, RESOURCE, DATA_SOURCE, LOCATION, LOCATION]
  )) as { rows: TValue[] };

  for (const batch of packBatches(rows)) {
    // eslint-disable-next-line no-await-in-loop
    await mergeBatch(knex, batch);
  }
}

// Every finding becomes one per resource again: the locations in each resource other than the one a finding names move
// to a copy of it, with the same triage, named after their oldest location there.
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
