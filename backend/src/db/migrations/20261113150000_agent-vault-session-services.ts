import { Knex } from "knex";

import { TableName } from "../schemas";

// The project services a session names itself, beside or instead of its access bundle. Like a bundle, the list is a
// ceiling fixed at mint: resolve sends only those the session's owner still reaches. Guarded so a database that already
// has the table keeps it as it is.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultSessionService))) {
    await knex.schema.createTable(TableName.AgentVaultSessionService, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.AgentVaultService).onDelete("CASCADE");
      t.index("serviceId");

      t.integer("position").notNullable();

      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.unique(["sessionId", "serviceId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentVaultSessionService);
}
