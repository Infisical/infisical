import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSubOrgId = await knex.schema.hasColumn(TableName.ObservabilityWidget, "subOrgId");
  if (!hasSubOrgId) {
    await knex.raw(`
      ALTER TABLE ${TableName.ObservabilityWidget}
      ADD COLUMN "subOrgId" UUID REFERENCES ${TableName.Organization}(id) ON DELETE CASCADE
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSubOrgId = await knex.schema.hasColumn(TableName.ObservabilityWidget, "subOrgId");
  if (hasSubOrgId) {
    await knex.raw(`
      ALTER TABLE ${TableName.ObservabilityWidget}
      DROP COLUMN "subOrgId"
    `);
  }
}
