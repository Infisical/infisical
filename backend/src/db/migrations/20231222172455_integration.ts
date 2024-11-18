import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IntegrationAuth))) {
    await knex.schema.createTable(TableName.IntegrationAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("integration").notNullable();
      t.string("teamId"); // vercel-specific
      t.string("url"); // for self-hosted
      t.string("namespace"); // hashicorp specific
      t.string("accountId"); // netlify
      t.text("refreshCiphertext");
      t.string("refreshIV");
      t.string("refreshTag");
      t.string("accessIdCiphertext");
      t.string("accessIdIV");
      t.string("accessIdTag");
      t.text("accessCiphertext");
      t.string("accessIV");
      t.string("accessTag");
      t.datetime("accessExpiresAt");
      t.jsonb("metadata");
      t.string("algorithm").notNullable();
      t.string("keyEncoding").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.IntegrationAuth);

  if (!(await knex.schema.hasTable(TableName.Integration))) {
    await knex.schema.createTable(TableName.Integration, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.boolean("isActive").notNullable();
      t.string("url"); // self-hosted
      t.string("app"); // name of app in provider
      t.string("appId");
      t.string("targetEnvironment");
      t.string("targetEnvironmentId");
      t.string("targetService"); // railway - qovery specific
      t.string("targetServiceId");
      t.string("owner"); // github specific
      t.string("path"); // aws parameter store / vercel preview branch
      t.string("region"); // aws
      t.string("scope"); // qovery specific scope
      t.string("integration").notNullable();
      t.jsonb("metadata");
      t.uuid("integrationAuthId").notNullable();
      t.foreign("integrationAuthId").references("id").inTable(TableName.IntegrationAuth).onDelete("CASCADE");
      t.uuid("envId").notNullable();
      t.string("secretPath").defaultTo("/").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.Integration);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Integration);
  await knex.schema.dropTableIfExists(TableName.IntegrationAuth);
  await dropOnUpdateTrigger(knex, TableName.IntegrationAuth);
  await dropOnUpdateTrigger(knex, TableName.Integration);
}
