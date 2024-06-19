import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.OidcConfig))) {
    await knex.schema.createTable(TableName.OidcConfig, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("discoveryURL");
      tb.string("issuer");
      tb.string("authorizationEndpoint");
      tb.string("jwksUri");
      tb.string("tokenEndpoint");
      tb.string("userinfoEndpoint");
      tb.text("encryptedClientId").notNullable();
      tb.string("configurationType").notNullable();
      tb.string("clientIdIV").notNullable();
      tb.string("clientIdTag").notNullable();
      tb.text("encryptedClientSecret").notNullable();
      tb.string("clientSecretIV").notNullable();
      tb.string("clientSecretTag").notNullable();
      tb.string("allowedEmailDomains").nullable();
      tb.boolean("isActive").notNullable();
      tb.timestamps(true, true, true);
      tb.uuid("orgId").notNullable().unique();
      tb.foreign("orgId").references("id").inTable(TableName.Organization);
    });
  }

  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    if (!(await knex.schema.hasColumn(TableName.SuperAdmin, "trustOidcEmails"))) {
      await knex.schema.alterTable(TableName.SuperAdmin, (tb) => {
        tb.boolean("trustOidcEmails").defaultTo(false);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.OidcConfig);

  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    if (await knex.schema.hasColumn(TableName.SuperAdmin, "trustOidcEmails")) {
      await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
        t.dropColumn("trustOidcEmails");
      });
    }
  }
}
