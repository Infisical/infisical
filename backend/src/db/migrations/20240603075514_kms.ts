import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.KmsServerRootConfig))) {
    await knex.schema.createTable(TableName.KmsServerRootConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.binary("encryptedRootKey").notNullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.KmsServerRootConfig);

  if (!(await knex.schema.hasTable(TableName.KmsKey))) {
    await knex.schema.createTable(TableName.KmsKey, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.binary("encryptedKey").notNullable();
      t.string("encryptionAlgorithm").notNullable();
      t.integer("version").defaultTo(1).notNullable();
      t.string("description");
      t.boolean("isDisabled").defaultTo(false);
      t.boolean("isReserved").defaultTo(true);
      t.string("projectId");
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }

  await createOnUpdateTrigger(knex, TableName.KmsKey);

  if (!(await knex.schema.hasTable(TableName.KmsKeyVersion))) {
    await knex.schema.createTable(TableName.KmsKeyVersion, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.binary("encryptedKey").notNullable();
      t.integer("version").notNullable();
      t.uuid("kmsKeyId").notNullable();
      t.foreign("kmsKeyId").references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
    });
  }

  await createOnUpdateTrigger(knex, TableName.KmsKeyVersion);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.KmsServerRootConfig);
  await dropOnUpdateTrigger(knex, TableName.KmsServerRootConfig);

  await knex.schema.dropTableIfExists(TableName.KmsKeyVersion);
  await dropOnUpdateTrigger(knex, TableName.KmsKeyVersion);

  await knex.schema.dropTableIfExists(TableName.KmsKey);
  await dropOnUpdateTrigger(knex, TableName.KmsKey);
}
