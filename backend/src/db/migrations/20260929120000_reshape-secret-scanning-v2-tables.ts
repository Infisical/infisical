import { Knex } from "knex";

import { TableName } from "../schemas";

const SCAN_STARTED_AT_LEGACY_INDEX = "secret_scanning_scans_scanning_started_at_index";
const SCAN_STARTED_AT_INDEX = "secret_scanning_scans_started_at_index";
const SCAN_TRIGGERED_BY_INDEX = "secret_scanning_scans_triggered_by_user_id_index";
const FINDING_TRIAGED_BY_INDEX = "secret_scanning_findings_triaged_by_user_id_index";

export async function up(knex: Knex): Promise<void> {
  // Scan workers write to these tables continuously; fail the deploy fast rather than queue behind them.
  await knex.raw("SET LOCAL lock_timeout = '10s'");

  if (await knex.schema.hasColumn(TableName.SecretScanningResource, "type")) {
    await knex.schema.alterTable(TableName.SecretScanningResource, (t) => {
      t.dropColumn("type");
    });
  }

  if (await knex.schema.hasColumn(TableName.SecretScanningScan, "scanningStartedAt")) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.renameColumn("scanningStartedAt", "startedAt");
    });
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.string("trigger").nullable();
      t.uuid("triggeredByUserId").nullable();
      t.foreign("triggeredByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.timestamp("completedAt").nullable();
      t.index("resourceId");
    });
    await knex.raw(`ALTER INDEX IF EXISTS ?? RENAME TO ??`, [SCAN_STARTED_AT_LEGACY_INDEX, SCAN_STARTED_AT_INDEX]);
    await knex.raw(`CREATE INDEX ?? ON ?? ("triggeredByUserId") WHERE "triggeredByUserId" IS NOT NULL`, [
      SCAN_TRIGGERED_BY_INDEX,
      TableName.SecretScanningScan
    ]);

    // Every existing full scan was started by someone creating a source or pressing scan, so they count as
    // manual; diff scans only ever came from a push webhook. SET expressions all read the pre-update row.
    await knex.raw(
      `UPDATE ?? SET
         type = CASE type WHEN 'full-scan' THEN 'historical' WHEN 'diff-scan' THEN 'realtime' ELSE type END,
         "trigger" = CASE type WHEN 'diff-scan' THEN 'push' ELSE 'manual' END,
         "createdAt" = COALESCE("createdAt", "startedAt", "progressUpdatedAt", NOW())`,
      [TableName.SecretScanningScan]
    );

    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.string("trigger").notNullable().alter();
      t.timestamp("createdAt").notNullable().defaultTo(knex.fn.now()).alter();
    });
  }

  if (await knex.schema.hasColumn(TableName.SecretScanningFinding, "projectId")) {
    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.uuid("resourceId").nullable();
    });

    await knex.raw(`UPDATE ?? AS f SET "resourceId" = s."resourceId" FROM ?? AS s WHERE s.id = f."scanId"`, [
      TableName.SecretScanningFinding,
      TableName.SecretScanningScan
    ]);

    // Every finding is inserted with its scan, and a scan only disappears when its resource is deleted
    // (SET NULL on scanId), so a finding with no resource here belongs to a resource that no longer exists.
    await knex(TableName.SecretScanningFinding).whereNull("resourceId").delete();

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.dropUnique(["projectId", "fingerprint"]);
      t.dropForeign(["scanId"]);
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.uuid("resourceId").notNullable().alter();
      t.uuid("scanId").notNullable().alter();
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.foreign("resourceId").references("id").inTable(TableName.SecretScanningResource).onDelete("CASCADE");
      t.unique(["resourceId", "fingerprint"]);
      t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("CASCADE");
      t.index("scanId");

      t.renameColumn("rule", "ruleKey");
      t.renameColumn("remarks", "triageComment");
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.text("triageComment").nullable().alter();
      t.string("confidence").nullable();
      t.uuid("triagedByUserId").nullable();
      t.foreign("triagedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.timestamp("triagedAt").nullable();
      t.timestamp("resolvedAt").nullable();

      t.dropColumn("dataSourceName");
      t.dropColumn("dataSourceType");
      t.dropColumn("resourceName");
      t.dropColumn("resourceType");
      t.dropColumn("projectId");
    });

    await knex.raw(`CREATE INDEX ?? ON ?? ("triagedByUserId") WHERE "triagedByUserId" IS NOT NULL`, [
      FINDING_TRIAGED_BY_INDEX,
      TableName.SecretScanningFinding
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '10s'");

  if (await knex.schema.hasColumn(TableName.SecretScanningFinding, "resourceId")) {
    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.string("projectId").nullable();
      t.string("dataSourceName").nullable();
      t.string("dataSourceType").nullable();
      t.string("resourceName").nullable();
      t.string("resourceType").nullable();
    });

    await knex.raw(
      `UPDATE ?? AS f SET
         "projectId" = src."projectId",
         "dataSourceName" = src.name,
         "dataSourceType" = src.type,
         "resourceName" = r.name,
         "resourceType" = CASE src.type WHEN 'gitlab' THEN 'project' ELSE 'repository' END
       FROM ?? AS r
       JOIN ?? AS src ON src.id = r."dataSourceId"
       WHERE r.id = f."resourceId"`,
      [TableName.SecretScanningFinding, TableName.SecretScanningResource, TableName.SecretScanningDataSource]
    );

    // The old key is per project, so the same fingerprint in two repos of one project collapses to its oldest row.
    await knex.raw(
      `DELETE FROM ?? AS f USING ?? AS older
       WHERE older."projectId" = f."projectId"
         AND older.fingerprint = f.fingerprint
         AND (older."createdAt", older.id) < (f."createdAt", f.id)`,
      [TableName.SecretScanningFinding, TableName.SecretScanningFinding]
    );

    await knex.raw(`UPDATE ?? SET "triageComment" = LEFT("triageComment", 255) WHERE LENGTH("triageComment") > 255`, [
      TableName.SecretScanningFinding
    ]);

    await knex.raw(`DROP INDEX IF EXISTS ??`, [FINDING_TRIAGED_BY_INDEX]);

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.dropUnique(["resourceId", "fingerprint"]);
      t.dropForeign(["scanId"]);
      t.dropIndex(["scanId"]);
      t.dropForeign(["resourceId"]);
      t.dropForeign(["triagedByUserId"]);
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.dropColumn("resourceId");
      t.dropColumn("confidence");
      t.dropColumn("triagedByUserId");
      t.dropColumn("triagedAt");
      t.dropColumn("resolvedAt");

      t.renameColumn("ruleKey", "rule");
      t.renameColumn("triageComment", "remarks");
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.string("remarks").nullable().alter();
      t.uuid("scanId").nullable().alter();
      t.string("projectId").notNullable().alter();
      t.string("dataSourceName").notNullable().alter();
      t.string("dataSourceType").notNullable().alter();
      t.string("resourceName").notNullable().alter();
      t.string("resourceType").notNullable().alter();
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("SET NULL");
      t.unique(["projectId", "fingerprint"]);
    });
  }

  if (await knex.schema.hasColumn(TableName.SecretScanningScan, "startedAt")) {
    await knex.raw(
      `UPDATE ?? SET type = CASE type WHEN 'historical' THEN 'full-scan' WHEN 'realtime' THEN 'diff-scan' ELSE type END`,
      [TableName.SecretScanningScan]
    );

    await knex.raw(`DROP INDEX IF EXISTS ??`, [SCAN_TRIGGERED_BY_INDEX]);
    await knex.raw(`ALTER INDEX IF EXISTS ?? RENAME TO ??`, [SCAN_STARTED_AT_INDEX, SCAN_STARTED_AT_LEGACY_INDEX]);

    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.dropForeign(["triggeredByUserId"]);
      t.dropIndex(["resourceId"]);
    });
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.dropColumn("trigger");
      t.dropColumn("triggeredByUserId");
      t.dropColumn("completedAt");
      t.renameColumn("startedAt", "scanningStartedAt");
    });
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.timestamp("createdAt").nullable().defaultTo(knex.fn.now()).alter();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.SecretScanningResource, "type"))) {
    await knex.schema.alterTable(TableName.SecretScanningResource, (t) => {
      t.string("type").nullable();
    });
    await knex.raw(
      `UPDATE ?? AS r SET type = CASE src.type WHEN 'gitlab' THEN 'project' ELSE 'repository' END
       FROM ?? AS src WHERE src.id = r."dataSourceId"`,
      [TableName.SecretScanningResource, TableName.SecretScanningDataSource]
    );
    await knex.schema.alterTable(TableName.SecretScanningResource, (t) => {
      t.string("type").notNullable().alter();
    });
  }
}
