import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretHttpProxyConfig))) {
    await knex.schema.createTable(TableName.SecretHttpProxyConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").notNullable().unique();
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      t.text("placeholder").notNullable();
      t.jsonb("rules").notNullable().defaultTo("[]");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SecretHttpProxyConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.SecretHttpProxyConfig);
  await knex.schema.dropTableIfExists(TableName.SecretHttpProxyConfig);
}
