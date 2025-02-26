import { Knex } from "knex";

import { SecretSharingType } from "@app/services/secret-sharing/secret-sharing-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSharingTypeColumn = await knex.schema.hasColumn(TableName.SecretSharing, "type");

  await knex.schema.alterTable(TableName.SecretSharing, (table) => {
    if (!hasSharingTypeColumn) {
      table.string("type", 32).defaultTo(SecretSharingType.Share).notNullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasSharingTypeColumn = await knex.schema.hasColumn(TableName.SecretSharing, "type");

  await knex.schema.alterTable(TableName.SecretSharing, (table) => {
    if (hasSharingTypeColumn) {
      table.dropColumn("type");
    }
  });
}
