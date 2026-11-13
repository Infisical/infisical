import { Knex } from "knex";

import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;

const RESOURCE_BATCH_SIZE = 500;
const FINDING_BATCH_SIZE = 5_000;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;
const ALTER_LOCK_TIMEOUT_MS = 10_000;

// Merges one batch of resources. A merge never crosses resources, so each batch is complete on its own.
const mergeResources = async (tx: Knex, resourceIds: string[]) => {
  await tx.raw(`SET LOCAL statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);

  // Rows of one value in one resource merge into the row that best keeps an open leak visible: an unresolved one,
  // else the most recently triaged. A finding a batch already merged comes first, so rerunning the migration only
  // adds rows saved since to it. A row with no blind index stays a finding of its own.
  await tx.raw(
    `CREATE TEMPORARY TABLE finding_merge AS
     SELECT
       f.id,
       first_value(f.id) OVER (
         PARTITION BY f."resourceId", COALESCE(f."secretFindingBlindIndex", f.id::text)
         ORDER BY
           EXISTS (SELECT 1 FROM ?? AS l WHERE l."findingId" = f.id) DESC,
           (f.status = ?) DESC, f."triagedAt" DESC NULLS LAST, f."createdAt", f.id
       ) AS "findingId"
     FROM ?? AS f
     WHERE f."resourceId" = ANY(?::uuid[])`,
    [LOCATION, SecretScanningFindingStatus.Unresolved, FINDING, resourceIds]
  );

  // A rerun after a partial failure merges the batches that committed again, and the finding they kept wins. If the
  // release before this one saved an unresolved row for a new place of that finding's value in between, the new place
  // reopens it, as a scan would, so the leak isn't merged away.
  await tx.raw(
    `UPDATE ?? AS w
     SET status = ?, "resolvedAt" = NULL
     FROM finding_merge AS m
     JOIN ?? AS f ON f.id = m.id
     WHERE w.id = m."findingId"
       AND m.id <> m."findingId"
       AND w.status = ?
       AND f.status = ?
       AND NOT EXISTS (
         SELECT 1 FROM ?? AS l WHERE l."resourceId" = f."resourceId" AND l.fingerprint = f.fingerprint
       )`,
    [
      FINDING,
      SecretScanningFindingStatus.Unresolved,
      FINDING,
      SecretScanningFindingStatus.Resolved,
      SecretScanningFindingStatus.Unresolved,
      LOCATION
    ]
  );

  // A row the release before this one saved again for a location that's already merged is only a copy of it.
  await tx.raw(
    `INSERT INTO ?? (id, "findingId", "resourceId", "scanId", fingerprint, rule, details, "createdAt")
     SELECT f.id, m."findingId", f."resourceId", f."scanId", f.fingerprint, f.rule, f.details, f."createdAt"
     FROM ?? AS f
     JOIN finding_merge AS m ON m.id = f.id
     WHERE NOT EXISTS (SELECT 1 FROM ?? AS l WHERE l."findingId" = f.id)
     ON CONFLICT ("resourceId", fingerprint) DO NOTHING`,
    [LOCATION, FINDING, LOCATION]
  );

  await tx.raw(
    `UPDATE ?? AS f
     SET "createdAt" = l."firstDetectedAt", "lastDetectedAt" = l."lastDetectedAt"
     FROM (
       SELECT "findingId", min("createdAt") AS "firstDetectedAt", max("createdAt") AS "lastDetectedAt"
       FROM ??
       WHERE "findingId" IN (SELECT "findingId" FROM finding_merge)
       GROUP BY "findingId"
     ) AS l
     WHERE l."findingId" = f.id
       AND (f."createdAt", f."lastDetectedAt") IS DISTINCT FROM (l."firstDetectedAt", l."lastDetectedAt")`,
    [FINDING, LOCATION]
  );

  await tx.raw(`DELETE FROM ?? AS f USING finding_merge AS m WHERE m.id = f.id AND m."findingId" <> f.id`, [FINDING]);

  await tx.raw(`DROP TABLE finding_merge`);
};

// Every finding row becomes a location, and the rows of one secret value in one resource merge into one finding.
// Runs a batch of resources per transaction, so no finding stays locked for the whole migration. Merging a batch again
// changes nothing, so an interrupted run can simply start over.
export async function up(knex: Knex): Promise<void> {
  let lastResourceId: string | null = null;

  for (;;) {
    const cursor = lastResourceId;
    // eslint-disable-next-line no-await-in-loop
    const resources: { id: string; findingCount: number }[] = await knex(TableName.SecretScanningResource)
      .modify((qb) => {
        if (cursor) void qb.where("id", ">", cursor);
      })
      .orderBy("id")
      .limit(RESOURCE_BATCH_SIZE)
      .select(
        "id",
        knex.raw(`(SELECT count(*)::int FROM ?? AS f WHERE f."resourceId" = ??.id) AS "findingCount"`, [
          FINDING,
          TableName.SecretScanningResource
        ])
      );

    if (!resources.length) break;

    // A batch holds the rows it merges until it commits, so it stops at a few thousand findings. A resource is never
    // split, since its rows merge with each other.
    const resourceIds: string[] = [];
    let findingCount = 0;
    for (const resource of resources) {
      if (resourceIds.length && findingCount + resource.findingCount > FINDING_BATCH_SIZE) break;
      resourceIds.push(resource.id);
      findingCount += resource.findingCount;
    }

    // eslint-disable-next-line no-await-in-loop
    await knex.transaction((tx) => mergeResources(tx, resourceIds));
    lastResourceId = resourceIds[resourceIds.length - 1];
  }

  // Rows saved while this ran got the column's default, so this only covers a row no batch could give a location.
  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT_MS}`);
    await tx.raw(`UPDATE ?? SET "lastDetectedAt" = "createdAt" WHERE "lastDetectedAt" IS NULL`, [FINDING]);
    await tx.raw(`ALTER TABLE ?? ALTER COLUMN "lastDetectedAt" SET NOT NULL`, [FINDING]);
  });
}

// A finding still holds one of its locations in its own columns, so every other location becomes a finding of its own
// again, with the same triage. A location migrated from a finding has that finding's id, so the finding comes back
// under it and scans that saved its id still find it.
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(LOCATION))) return;

  await knex.transaction(async (tx) => {
    await tx.raw(
      `INSERT INTO ?? (
         id, "resourceId", "scanId", fingerprint, details, rule, severity, confidence, status, "triageComment",
         "triagedByUserId", "triagedAt", "resolvedAt", "secretFindingBlindIndex", "createdAt"
       )
       SELECT
         l.id, l."resourceId", l."scanId", l.fingerprint, l.details, l.rule, f.severity, f.confidence,
         f.status, f."triageComment", f."triagedByUserId", f."triagedAt", f."resolvedAt", f."secretFindingBlindIndex",
         l."createdAt"
       FROM ?? AS l
       JOIN ?? AS f ON f.id = l."findingId"
       WHERE f.fingerprint IS DISTINCT FROM l.fingerprint`,
      [FINDING, LOCATION, FINDING]
    );

    await tx(LOCATION).delete();
  });
}

const config = { transaction: false };
export { config };
