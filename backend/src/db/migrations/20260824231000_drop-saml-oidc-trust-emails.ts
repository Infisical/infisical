import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    const hasTrustSamlEmails = await knex.schema.hasColumn(TableName.SuperAdmin, "trustSamlEmails");
    const hasTrustOidcEmails = await knex.schema.hasColumn(TableName.SuperAdmin, "trustOidcEmails");

    if (hasTrustSamlEmails || hasTrustOidcEmails) {
      await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
        if (hasTrustSamlEmails) t.dropColumn("trustSamlEmails");
        if (hasTrustOidcEmails) t.dropColumn("trustOidcEmails");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    const hasTrustSamlEmails = await knex.schema.hasColumn(TableName.SuperAdmin, "trustSamlEmails");
    const hasTrustOidcEmails = await knex.schema.hasColumn(TableName.SuperAdmin, "trustOidcEmails");

    if (!hasTrustSamlEmails || !hasTrustOidcEmails) {
      await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
        if (!hasTrustSamlEmails) t.boolean("trustSamlEmails").defaultTo(false);
        if (!hasTrustOidcEmails) t.boolean("trustOidcEmails").defaultTo(false);
      });
    }
  }
}
