import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditLog))) {
    await knex.schema.createTable(TableName.AuditLog, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("actor").notNullable();
      t.jsonb("actorMetadata").notNullable();
      t.string("ipAddress");
      t.string("eventType").notNullable();
      t.jsonb("eventMetadata");
      t.string("userAgent");
      t.string("userAgentType");
      t.datetime("expiresAt");
      t.timestamps(true, true, true);
      // no trigger needed as this collection is append only
      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("projectId");
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AuditLog);
}
