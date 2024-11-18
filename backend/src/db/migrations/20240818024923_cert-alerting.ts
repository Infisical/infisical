import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiCollection))) {
    await knex.schema.createTable(TableName.PkiCollection, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("description").notNullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.PkiCollection);

  if (!(await knex.schema.hasTable(TableName.PkiCollectionItem))) {
    await knex.schema.createTable(TableName.PkiCollectionItem, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("pkiCollectionId").notNullable();
      t.foreign("pkiCollectionId").references("id").inTable(TableName.PkiCollection).onDelete("CASCADE");
      t.uuid("caId").nullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.uuid("certId").nullable();
      t.foreign("certId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
    });
  }

  await createOnUpdateTrigger(knex, TableName.PkiCollectionItem);

  if (!(await knex.schema.hasTable(TableName.PkiAlert))) {
    await knex.schema.createTable(TableName.PkiAlert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("pkiCollectionId").notNullable();
      t.foreign("pkiCollectionId").references("id").inTable(TableName.PkiCollection).onDelete("CASCADE");
      t.string("name").notNullable();
      t.integer("alertBeforeDays").notNullable();
      t.string("recipientEmails").notNullable();
      t.unique(["name", "projectId"]);
    });
  }

  await createOnUpdateTrigger(knex, TableName.PkiAlert);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PkiAlert);
  await dropOnUpdateTrigger(knex, TableName.PkiAlert);

  await knex.schema.dropTableIfExists(TableName.PkiCollectionItem);
  await dropOnUpdateTrigger(knex, TableName.PkiCollectionItem);

  await knex.schema.dropTableIfExists(TableName.PkiCollection);
  await dropOnUpdateTrigger(knex, TableName.PkiCollection);
}
