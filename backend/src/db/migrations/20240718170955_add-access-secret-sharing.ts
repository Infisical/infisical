import { Knex } from "knex";

import { SecretSharingAccessType } from "@app/lib/types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretSharing, "accessType");
  if (!hasColumn) {
    await knex.schema.table(TableName.SecretSharing, (table) => {
      table.string("accessType").notNullable().defaultTo(SecretSharingAccessType.Anyone);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretSharing, "accessType");
  if (hasColumn) {
    await knex.schema.table(TableName.SecretSharing, (table) => {
      table.dropColumn("accessType");
    });
  }
}
