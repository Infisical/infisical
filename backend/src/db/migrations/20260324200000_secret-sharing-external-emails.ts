import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasExternalEmails = await knex.schema.hasColumn(TableName.SecretSharing, "externalEmails");
  const hasAllowExternalEmails = await knex.schema.hasColumn(TableName.SecretSharing, "allowExternalEmails");

  if (!hasExternalEmails || !hasAllowExternalEmails) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      if (!hasExternalEmails) {
        t.json("externalEmails").nullable();
      }
      if (!hasAllowExternalEmails) {
        t.boolean("allowExternalEmails").nullable().defaultTo(false);
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasExternalEmails = await knex.schema.hasColumn(TableName.SecretSharing, "externalEmails");
  const hasAllowExternalEmails = await knex.schema.hasColumn(TableName.SecretSharing, "allowExternalEmails");

  if (hasExternalEmails || hasAllowExternalEmails) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      if (hasExternalEmails) {
        t.dropColumn("externalEmails");
      }
      if (hasAllowExternalEmails) {
        t.dropColumn("allowExternalEmails");
      }
    });
  }
}
