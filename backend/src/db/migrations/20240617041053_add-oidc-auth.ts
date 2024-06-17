import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.OidcConfig))) {
    await knex.schema.createTable(TableName.OidcConfig, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("issuer");
      tb.string("authorizationEndpoint");
      tb.string("jwksUri");
      tb.string("tokenEndpoint");
      tb.string("userinfoEndpoint");
      tb.text("encryptedClientId");
      tb.string("clientIdIV");
      tb.string("clientIdTag");
      tb.text("encryptedClientSecret");
      tb.string("clientSecretIV");
      tb.string("clientSecretTag");
      tb.boolean("isActive").notNullable();
      tb.timestamps(true, true, true);
      tb.uuid("orgId").notNullable().unique();
      tb.foreign("orgId").references("id").inTable(TableName.Organization);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.OidcConfig);
}
