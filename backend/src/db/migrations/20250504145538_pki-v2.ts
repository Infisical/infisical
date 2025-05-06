import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiSubscriber))) {
    await knex.schema.createTable(TableName.PkiSubscriber, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("caId").notNullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("commonName").notNullable();
      t.specificType("subjectAlternativeNames", "text[]").notNullable();
      t.string("ttl").notNullable();
      t.specificType("keyUsages", "text[]").notNullable();
      t.specificType("extendedKeyUsages", "text[]").notNullable();
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.PkiSubscriber);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PkiSubscriber);
  await dropOnUpdateTrigger(knex, TableName.PkiSubscriber);
}
