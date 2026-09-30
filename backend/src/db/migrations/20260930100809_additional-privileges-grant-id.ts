import { Knex } from "knex";

import { TableName } from "../schemas";

const GRANT_ID_UNIQUE_INDEX = "additional_privileges_grant_id_unique";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "grantId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.uuid("grantId").nullable();
      t.foreign("grantId").references("id").inTable(TableName.ApprovalRequestGrants).onDelete("SET NULL");
      t.unique(["grantId"], { indexName: GRANT_ID_UNIQUE_INDEX });
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "${GRANT_ID_UNIQUE_INDEX}"`);

  const hasColumn = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "grantId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.dropForeign("grantId");
      t.dropColumn("grantId");
    });
  }
}
