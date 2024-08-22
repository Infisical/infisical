import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesExpireAtExist = await knex.schema.hasColumn(TableName.AuditLog, "expiresAt");
  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesExpireAtExist) t.index("expiresAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesExpireAtExist = await knex.schema.hasColumn(TableName.AuditLog, "expiresAt");

  if (await knex.schema.hasTable(TableName.AuditLog)) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      if (doesExpireAtExist) t.dropIndex("expiresAt");
    });
  }
}
