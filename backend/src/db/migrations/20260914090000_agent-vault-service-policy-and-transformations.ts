import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasAllowedMethods = await knex.schema.hasColumn(TableName.AgentVaultService, "allowedMethods");
  const hasAllowedPathPrefixes = await knex.schema.hasColumn(TableName.AgentVaultService, "allowedPathPrefixes");

  if (!hasAllowedMethods || !hasAllowedPathPrefixes) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      // NULL is the only "unrestricted": an empty array is never stored, so there is one representation of "all".
      // Arrays rather than the comma-separated strings hostPattern uses, because a comma is legal in a path.
      if (!hasAllowedMethods) t.specificType("allowedMethods", "text[]");
      if (!hasAllowedPathPrefixes) t.specificType("allowedPathPrefixes", "text[]");
    });
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultServiceHeader))) {
    await knex.schema.createTable(TableName.AgentVaultServiceHeader, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.AgentVaultService).onDelete("CASCADE");
      t.index("serviceId");

      t.string("name", 128).notNullable();
      t.string("prefix", 64).notNullable();

      t.binary("encryptedValue").notNullable();

      t.integer("position").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultServiceHeader);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultServiceSubstitution))) {
    await knex.schema.createTable(TableName.AgentVaultServiceSubstitution, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.AgentVaultService).onDelete("CASCADE");
      t.index("serviceId");

      t.string("placeholder", 255).notNullable();
      t.specificType("surfaces", "text[]").notNullable();

      t.binary("encryptedValue").notNullable();

      t.integer("position").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultServiceSubstitution);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentVaultServiceSubstitution);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultServiceSubstitution);

  await knex.schema.dropTableIfExists(TableName.AgentVaultServiceHeader);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultServiceHeader);

  const hasAllowedMethods = await knex.schema.hasColumn(TableName.AgentVaultService, "allowedMethods");
  const hasAllowedPathPrefixes = await knex.schema.hasColumn(TableName.AgentVaultService, "allowedPathPrefixes");

  if (hasAllowedMethods || hasAllowedPathPrefixes) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      if (hasAllowedMethods) t.dropColumn("allowedMethods");
      if (hasAllowedPathPrefixes) t.dropColumn("allowedPathPrefixes");
    });
  }
}
