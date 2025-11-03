import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasOrgBlockDuplicateColumn = await knex.schema.hasColumn(
    TableName.Organization,
    "blockDuplicateSecretSyncDestinations"
  );
  if (!hasOrgBlockDuplicateColumn) {
    await knex.schema.table(TableName.Organization, (table) => {
      table.boolean("blockDuplicateSecretSyncDestinations").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOrgBlockDuplicateColumn = await knex.schema.hasColumn(
    TableName.Organization,
    "blockDuplicateSecretSyncDestinations"
  );
  if (hasOrgBlockDuplicateColumn) {
    await knex.schema.table(TableName.Organization, (table) => {
      table.dropColumn("blockDuplicateSecretSyncDestinations");
    });
  }
}
