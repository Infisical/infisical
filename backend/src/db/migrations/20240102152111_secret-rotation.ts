import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretRotation))) {
    await knex.schema.createTable(TableName.SecretRotation, (t) => {
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
  await createOnUpdateTrigger(knex, TableName.SecretRotation);

  if (!(await knex.schema.hasTable(TableName.SecretRotationOutput))) {
    await knex.schema.createTable(TableName.SecretRotationOutput, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("key").notNullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.Secret).onDelete("CASCADE");
      t.uuid("rotationId").notNullable();
      t.foreign("rotationId").references("id").inTable(TableName.SecretRotation).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretRotationOutput);
  await knex.schema.dropTableIfExists(TableName.SecretRotation);
  await dropOnUpdateTrigger(knex, TableName.SecretRotation);
}
