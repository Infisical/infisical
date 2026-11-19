import { Knex } from "knex";

import { SecretScanningScanType } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { TableName } from "../schemas";

const SCAN_STARTED_AT_LEGACY_INDEX = "secret_scanning_scans_scanning_started_at_index";
const SCAN_STARTED_AT_INDEX = "secret_scanning_scans_started_at_index";

// Indexes on these tables are built concurrently in the next migration, outside this transaction.

export async function up(knex: Knex): Promise<void> {
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
      t.uuid("triggeredByUserId").nullable();
      t.foreign("triggeredByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.timestamp("completedAt").nullable();
    });
    await knex.raw(`ALTER INDEX IF EXISTS ?? RENAME TO ??`, [SCAN_STARTED_AT_LEGACY_INDEX, SCAN_STARTED_AT_INDEX]);

    await knex(TableName.SecretScanningScan).whereNull("createdAt").delete();

    await knex(TableName.SecretScanningScan)
      .where({ type: "full-scan" })
      .update({ type: SecretScanningScanType.Historical });
    await knex(TableName.SecretScanningScan)
      .where({ type: "diff-scan" })
      .update({ type: SecretScanningScanType.Realtime });

    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
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

    // Every finding is inserted with its scan, so a finding with no resource here lost its scan (SET NULL on scanId),
    // either because the scan's resource was deleted or because the scan was dropped above for having no createdAt.
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
      t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("CASCADE");

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
  }
}

export async function down(knex: Knex): Promise<void> {
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

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.dropForeign(["scanId"]);
      t.dropForeign(["resourceId"]);
      t.dropForeign(["triagedByUserId"]);
    });

    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.dropColumn("resourceId");
      t.dropColumn("confidence");
      t.dropColumn("triagedByUserId");
      t.dropColumn("triagedAt");
      t.dropColumn("resolvedAt");

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
    await knex(TableName.SecretScanningScan)
      .where({ type: SecretScanningScanType.Historical })
      .update({ type: "full-scan" });
    await knex(TableName.SecretScanningScan)
      .where({ type: SecretScanningScanType.Realtime })
      .update({ type: "diff-scan" });

    await knex.raw(`ALTER INDEX IF EXISTS ?? RENAME TO ??`, [SCAN_STARTED_AT_INDEX, SCAN_STARTED_AT_LEGACY_INDEX]);

    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.dropForeign(["triggeredByUserId"]);
    });
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
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
