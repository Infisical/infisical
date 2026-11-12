import { Knex } from "knex";

import {
  SecretScanningFindingStatus,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;

const FINDING_VALUE_UNIQUE = "secret_scanning_findings_resource_value_unique";
const OLD_FINDING_LOCATION_UNIQUE = "secret_scanning_findings_resourceid_fingerprint_unique";
const OLD_BLIND_INDEX_INDEX = "idx_secret_scanning_findings_secret_finding_blind_index";

// A finding becomes one secret value in one resource, and every place that value was found becomes a location of it.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(LOCATION)) return;

  await knex.schema.createTable(LOCATION, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.uuid("findingId").notNullable();
    t.foreign("findingId").references("id").inTable(FINDING).onDelete("CASCADE");
    t.uuid("resourceId").notNullable();
    t.foreign("resourceId").references("id").inTable(TableName.SecretScanningResource).onDelete("CASCADE");
    t.uuid("scanId").notNullable();
    t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("CASCADE");
    t.string("fingerprint").notNullable();
    t.string("rule").notNullable();
    t.jsonb("details").notNullable();
    t.timestamp("createdAt").notNullable().defaultTo(knex.fn.now());

    t.unique(["resourceId", "fingerprint"]);
    t.index(["findingId", "createdAt"]);
    t.index("scanId");
  });

  await knex.raw(`DROP INDEX IF EXISTS ??`, [OLD_FINDING_LOCATION_UNIQUE]);

  // Diff scans used to store the column one lower than full scans for the same leak, so their fingerprints never
  // matched. Correcting them can make two rows the same location, which the steps below merge.
  await knex.raw(
    `UPDATE ?? AS f
     SET fingerprint = substring(f.fingerprint from '^(.*):[0-9]+$') || ':' ||
       (substring(f.fingerprint from ':([0-9]+)$')::int + 1)
     FROM ?? AS s
     WHERE s.id = f."scanId" AND s.type = ? AND f.fingerprint ~ ':[0-9]+$'`,
    [FINDING, TableName.SecretScanningScan, SecretScanningScanType.Realtime]
  );

  // The same location found by both kinds of scan holds the same value, so a row with no blind index takes its twin's.
  await knex.raw(
    `UPDATE ?? AS f
     SET "secretFindingBlindIndex" = twin."secretFindingBlindIndex"
     FROM ?? AS twin
     WHERE f."secretFindingBlindIndex" IS NULL
       AND twin."secretFindingBlindIndex" IS NOT NULL
       AND twin."resourceId" = f."resourceId"
       AND twin.fingerprint = f.fingerprint`,
    [FINDING, FINDING]
  );

  // Rows of one value in one resource merge into the row that best keeps an open leak visible: an unresolved one,
  // else the most recently triaged. A row with no blind index can only merge with rows at its own location.
  await knex.raw(
    `CREATE TEMPORARY TABLE finding_merge ON COMMIT DROP AS
     SELECT
       id,
       first_value(id) OVER (
         PARTITION BY "resourceId", COALESCE("secretFindingBlindIndex", 'fingerprint:' || fingerprint)
         ORDER BY (status = ?) DESC, "triagedAt" DESC NULLS LAST, "createdAt", id
       ) AS "findingId"
     FROM ??`,
    [SecretScanningFindingStatus.Unresolved, FINDING]
  );

  await knex.raw(
    `INSERT INTO ?? (id, "findingId", "resourceId", "scanId", fingerprint, rule, details, "createdAt")
     SELECT DISTINCT ON (f."resourceId", f.fingerprint)
       f.id, m."findingId", f."resourceId", f."scanId", f.fingerprint, f.rule, f.details, f."createdAt"
     FROM ?? AS f
     JOIN finding_merge AS m ON m.id = f.id
     ORDER BY f."resourceId", f.fingerprint, f."createdAt", f.id`,
    [LOCATION, FINDING]
  );

  await knex.schema.alterTable(FINDING, (t) => {
    t.timestamp("lastDetectedAt").nullable();
  });

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

  // the rows merged into another finding, which have no location of their own
  await knex(FINDING).whereNull("lastDetectedAt").delete();

  await knex.raw(`DROP INDEX IF EXISTS ??`, [OLD_BLIND_INDEX_INDEX]);

  await knex.schema.alterTable(FINDING, (t) => {
    t.dropForeign(["scanId"]);
    t.dropColumn("scanId");
    t.dropColumn("fingerprint");
    t.dropColumn("details");
    t.timestamp("lastDetectedAt").notNullable().defaultTo(knex.fn.now()).alter();
    // NULLs are distinct, so findings from before blind indexes existed stay one per location
    t.unique(["resourceId", "secretFindingBlindIndex"], { indexName: FINDING_VALUE_UNIQUE });
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(LOCATION))) return;

  await knex.schema.alterTable(FINDING, (t) => {
    t.dropUnique(["resourceId", "secretFindingBlindIndex"], FINDING_VALUE_UNIQUE);
    t.uuid("scanId").nullable();
    t.string("fingerprint").nullable();
    t.jsonb("details").nullable();
  });

  // A finding takes its first location back; every other location becomes a finding of its own with the same triage.
  await knex.raw(
    `UPDATE ?? AS f
     SET "scanId" = l."scanId", fingerprint = l.fingerprint, details = l.details
     FROM (
       SELECT DISTINCT ON ("findingId") * FROM ?? ORDER BY "findingId", "createdAt", id
     ) AS l
     WHERE l."findingId" = f.id`,
    [FINDING, LOCATION]
  );

  await knex.raw(
    `INSERT INTO ?? (
       id, "resourceId", "scanId", fingerprint, details, rule, severity, confidence, status, "triageComment",
       "triagedByUserId", "triagedAt", "resolvedAt", "secretFindingBlindIndex", "createdAt"
     )
     SELECT
       gen_random_uuid(), l."resourceId", l."scanId", l.fingerprint, l.details, l.rule, f.severity, f.confidence, f.status,
       f."triageComment", f."triagedByUserId", f."triagedAt", f."resolvedAt", f."secretFindingBlindIndex", l."createdAt"
     FROM ?? AS l
     JOIN ?? AS f ON f.id = l."findingId"
     WHERE f.fingerprint IS DISTINCT FROM l.fingerprint`,
    [FINDING, LOCATION, FINDING]
  );

  await knex(FINDING).whereNull("scanId").delete();

  await knex.schema.alterTable(FINDING, (t) => {
    t.uuid("scanId").notNullable().alter();
    t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("CASCADE");
    t.string("fingerprint").notNullable().alter();
    t.jsonb("details").notNullable().alter();
    t.dropColumn("lastDetectedAt");
    t.index("scanId", "secret_scanning_findings_scanid_index");
  });

  await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ?? ("resourceId", fingerprint)`, [
    OLD_FINDING_LOCATION_UNIQUE,
    FINDING
  ]);
  await knex.raw(`CREATE INDEX IF NOT EXISTS ?? ON ?? ("secretFindingBlindIndex") WHERE "secretFindingBlindIndex" IS NOT NULL`, [
    OLD_BLIND_INDEX_INDEX,
    FINDING
  ]);

  await knex.schema.dropTableIfExists(LOCATION);
}
