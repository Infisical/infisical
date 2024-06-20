import { Knex } from "knex";

import { TableName } from "../schemas";

const DEFAULT_ORG_ID_FIELD = "defaultOrgId";

export async function up(knex: Knex): Promise<void> {
  const hasDefaultOrgColumn = await knex.schema.hasColumn(TableName.SuperAdmin, DEFAULT_ORG_ID_FIELD);

  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    if (!hasDefaultOrgColumn) {
      t.uuid(DEFAULT_ORG_ID_FIELD).nullable();
      t.foreign(DEFAULT_ORG_ID_FIELD).references("id").inTable(TableName.Organization).onDelete("SET NULL");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasDefaultOrgColumn = await knex.schema.hasColumn(TableName.SuperAdmin, DEFAULT_ORG_ID_FIELD);

  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    if (hasDefaultOrgColumn) {
      t.dropForeign([DEFAULT_ORG_ID_FIELD]);
      t.dropColumn(DEFAULT_ORG_ID_FIELD);
    }
  });
}
