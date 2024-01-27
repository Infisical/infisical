import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.OrgBot))) {
    await knex.schema.createTable(TableName.OrgBot, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.text("publicKey").notNullable();
      t.text("encryptedSymmetricKey").notNullable();
      t.text("symmetricKeyIV").notNullable();
      t.text("symmetricKeyTag").notNullable();
      t.string("symmetricKeyAlgorithm").notNullable();
      t.string("symmetricKeyKeyEncoding").notNullable();
      t.text("encryptedPrivateKey").notNullable();
      t.text("privateKeyIV").notNullable();
      t.text("privateKeyTag").notNullable();
      t.string("privateKeyAlgorithm").notNullable();
      t.string("privateKeyKeyEncoding").notNullable();
      // one to one relationship
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.OrgBot);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.OrgBot);
  await dropOnUpdateTrigger(knex, TableName.OrgBot);
}
