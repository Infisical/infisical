import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.DynamicSecretUserCredential))) {
    await knex.schema.createTable(TableName.DynamicSecretUserCredential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("dynamicSecretId").notNullable();
      t.foreign("dynamicSecretId").references("id").inTable(TableName.DynamicSecret).onDelete("CASCADE");
      t.string("externalUserId", 255).notNullable();
      t.binary("encryptedCredentials").notNullable();
      t.datetime("accessTokenExpiresAt", { useTz: true }).nullable();
      t.string("status").notNullable().defaultTo("active");
      t.text("statusDetails").nullable();
      t.datetime("lastRefreshedAt", { useTz: true }).nullable();
      t.integer("version").notNullable().defaultTo(1);
      t.timestamps(true, true, true);
      // also the index for the dynamicSecretId foreign key, as its leftmost column
      t.unique(["dynamicSecretId", "externalUserId"]);
    });

    await createOnUpdateTrigger(knex, TableName.DynamicSecretUserCredential);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.DynamicSecretUserCredential);
  await knex.schema.dropTableIfExists(TableName.DynamicSecretUserCredential);
}
