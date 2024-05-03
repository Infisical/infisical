import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AuditLogStream))) {
    await knex.schema.createTable(TableName.AuditLogStream, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("url").notNullable();
      t.text("encryptedHeadersCiphertext");
      t.text("encryptedHeadersIV");
      t.text("encryptedHeadersTag");
      t.string("encryptedHeadersAlgorithm");
      t.string("encryptedHeadersKeyEncoding");
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.AuditLogStream);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AuditLogStream);
  await knex.schema.dropTableIfExists(TableName.AuditLogStream);
}
