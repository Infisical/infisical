import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SshHost))) {
    await knex.schema.createTable(TableName.SshHost, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("hostname").notNullable();
      t.string("userCertTtl").notNullable();
      t.string("hostCertTtl").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshHost);
  }

  if (!(await knex.schema.hasTable(TableName.SshHostLoginMapping))) {
    await knex.schema.createTable(TableName.SshHostLoginMapping, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshHostId").notNullable();
      t.foreign("sshHostId").references("id").inTable(TableName.SshHost).onDelete("CASCADE");
      t.string("loginUser").notNullable();
      t.specificType("allowedPrincipals", "text[]").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshHostLoginMapping);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SshHostLoginMapping);
  await dropOnUpdateTrigger(knex, TableName.SshHostLoginMapping);

  await knex.schema.dropTableIfExists(TableName.SshHost);
  await dropOnUpdateTrigger(knex, TableName.SshHost);
}
