import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Sandbox))) {
    await knex.schema.createTable(TableName.Sandbox, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("name").notNullable();
      t.string("description", 500);
      t.string("kind").notNullable();
      t.string("template").notNullable();

      t.integer("vcpu").notNullable().defaultTo(2);
      t.integer("memoryMb").notNullable().defaultTo(2048);

      // Which PAM accounts, proxied services and CLIs this sandbox may reach. Held as one document
      // because it is always read and written whole, and the referenced resources live in tables
      // whose rows a sandbox must not pin. No column default: the schema generator emits invalid
      // Zod for a defaulted jsonb, so the service always supplies the value.
      t.jsonb("grants").notNullable();

      t.integer("commandsRun").notNullable().defaultTo(0);
      t.timestamp("lastActivityAt");

      // Covers the orgId foreign key as its leftmost column, so no separate FK index is needed.
      t.unique(["orgId", "name"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.Sandbox);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Sandbox);
  await dropOnUpdateTrigger(knex, TableName.Sandbox);
}
