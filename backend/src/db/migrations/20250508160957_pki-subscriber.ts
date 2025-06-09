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
      t.uuid("caId").nullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
      t.string("name").notNullable();
      t.string("commonName").notNullable();
      t.specificType("subjectAlternativeNames", "text[]").notNullable();
      t.string("ttl").notNullable();
      t.specificType("keyUsages", "text[]").notNullable();
      t.specificType("extendedKeyUsages", "text[]").notNullable();
      t.string("status").notNullable(); // active / disabled
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.PkiSubscriber);
  }

  const hasSubscriberCol = await knex.schema.hasColumn(TableName.Certificate, "pkiSubscriberId");
  if (!hasSubscriberCol) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("pkiSubscriberId").nullable();
      t.foreign("pkiSubscriberId").references("id").inTable(TableName.PkiSubscriber).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSubscriberCol = await knex.schema.hasColumn(TableName.Certificate, "pkiSubscriberId");
  if (hasSubscriberCol) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropColumn("pkiSubscriberId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.PkiSubscriber);
  await dropOnUpdateTrigger(knex, TableName.PkiSubscriber);
}
