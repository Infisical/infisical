import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.DeprecatedSecretRotationV1))) {
    await knex.schema.createTable(TableName.DeprecatedSecretRotationV1, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("provider").notNullable();
      t.string("secretPath").notNullable();
      t.integer("interval").notNullable();
      t.datetime("lastRotatedAt");
      t.string("status");
      t.text("statusMessage");
      t.text("encryptedData");
      t.text("encryptedDataIV");
      t.text("encryptedDataTag");
      t.string("algorithm");
      t.string("keyEncoding");
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.DeprecatedSecretRotationV1);

  if (!(await knex.schema.hasTable(TableName.DeprecatedSecretRotationOutput))) {
    await knex.schema.createTable(TableName.DeprecatedSecretRotationOutput, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("key").notNullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.Secret).onDelete("CASCADE");
      t.uuid("rotationId").notNullable();
      t.foreign("rotationId").references("id").inTable(TableName.DeprecatedSecretRotationV1).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.DeprecatedSecretRotationV1);
  await knex.schema.dropTableIfExists(TableName.DeprecatedSecretRotationOutput);
  await knex.schema.dropTableIfExists(TableName.DeprecatedSecretRotationV1);
}
