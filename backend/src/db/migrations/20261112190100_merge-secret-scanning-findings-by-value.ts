import { Knex } from "knex";

import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;

// Every finding row becomes a location, and the rows of one secret value in one resource merge into one finding.
export async function up(knex: Knex): Promise<void> {
  // already merged
  if (await knex(LOCATION).first("id")) return;

  // Rows of one value in one resource merge into the row that best keeps an open leak visible: an unresolved one,
  // else the most recently triaged. A row with no blind index stays a finding of its own.
  await knex.raw(
    `CREATE TEMPORARY TABLE finding_merge ON COMMIT DROP AS
     SELECT
       id,
       first_value(id) OVER (
         PARTITION BY "resourceId", COALESCE("secretFindingBlindIndex", id::text)
         ORDER BY (status = ?) DESC, "triagedAt" DESC NULLS LAST, "createdAt", id
       ) AS "findingId"
     FROM ??`,
    [SecretScanningFindingStatus.Unresolved, FINDING]
  );

  await knex.raw(
    `INSERT INTO ?? (id, "findingId", "resourceId", "scanId", fingerprint, rule, details, "createdAt")
     SELECT f.id, m."findingId", f."resourceId", f."scanId", f.fingerprint, f.rule, f.details, f."createdAt"
     FROM ?? AS f
     JOIN finding_merge AS m ON m.id = f.id`,
    [LOCATION, FINDING]
  );

  await knex.raw(
    `UPDATE ?? AS f
     SET "createdAt" = l."firstDetectedAt", "lastDetectedAt" = l."lastDetectedAt"
     FROM (
       SELECT "findingId", min("createdAt") AS "firstDetectedAt", max("createdAt") AS "lastDetectedAt"
       FROM ??
       GROUP BY "findingId"
     ) AS l
     WHERE l."findingId" = f.id`,
    [FINDING, LOCATION]
  );

  await knex.raw(`DELETE FROM ?? AS f USING finding_merge AS m WHERE m.id = f.id AND m."findingId" <> f.id`, [FINDING]);

  // The finding's own scanId, fingerprint and details stay, holding one of its locations, so the release before this
  // one still works. A value has no unique constraint for the same reason: that release saves a finding per location.
  await knex.schema.alterTable(FINDING, (t) => {
    t.timestamp("lastDetectedAt").notNullable().defaultTo(knex.fn.now()).alter();
  });
}

// A finding still holds one of its locations in its own columns, so every other location becomes a finding of its own
// again, with the same triage. A location migrated from a finding has that finding's id, so the finding comes back
// under it and scans that saved its id still find it.
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(LOCATION))) return;

  await knex.schema.alterTable(FINDING, (t) => {
    t.timestamp("lastDetectedAt").nullable().alter();
  });

  await knex.raw(
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

  await knex(LOCATION).delete();
}
