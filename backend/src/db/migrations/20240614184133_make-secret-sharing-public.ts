import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasOrgIdColumn = await knex.schema.hasColumn(TableName.SecretSharing, "orgId");
  const hasUserIdColumn = await knex.schema.hasColumn(TableName.SecretSharing, "userId");

  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      if (hasOrgIdColumn) t.uuid("orgId").nullable().alter();
      if (hasUserIdColumn) t.uuid("userId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOrgIdColumn = await knex.schema.hasColumn(TableName.SecretSharing, "orgId");
  const hasUserIdColumn = await knex.schema.hasColumn(TableName.SecretSharing, "userId");

  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      if (hasOrgIdColumn) t.uuid("orgId").notNullable().alter();
      if (hasUserIdColumn) t.uuid("userId").notNullable().alter();
    });
  }
}
