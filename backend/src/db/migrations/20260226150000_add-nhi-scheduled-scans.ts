import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasScheduleCol = await knex.schema.hasColumn(TableName.NhiSource, "scanSchedule");
  if (!hasScheduleCol) {
    await knex.schema.alterTable(TableName.NhiSource, (t) => {
      t.string("scanSchedule", 16).nullable();
      t.datetime("lastScheduledScanAt").nullable();
      t.uuid("orgId").nullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("SET NULL");
      t.uuid("createdByUserId").nullable();
      t.foreign("createdByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
    });

    // Backfill orgId from projects table
    await knex.raw(`
      UPDATE ${TableName.NhiSource} s
      SET "orgId" = p."orgId"
      FROM ${TableName.Project} p
      WHERE s."projectId" = p.id
        AND s."orgId" IS NULL
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasScheduleCol = await knex.schema.hasColumn(TableName.NhiSource, "scanSchedule");
  if (hasScheduleCol) {
    await knex.schema.alterTable(TableName.NhiSource, (t) => {
      t.dropColumn("scanSchedule");
      t.dropColumn("lastScheduledScanAt");
      t.dropColumn("createdByUserId");
      t.dropColumn("orgId");
    });
  }
}
