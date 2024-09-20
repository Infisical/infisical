import { Knex } from "knex";

import { UserSecretType } from "@app/lib/types";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecret))) {
    await knex.schema.createTable(TableName.UserSecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").nullable();
      t.text("encryptedValue").notNullable();
      t.text("iv").notNullable();
      t.text("hashedHex").notNullable();
      t.text("tag").notNullable();
      t.uuid("userId").notNullable();
      t.uuid("orgId").notNullable();
      t.string("secretType").notNullable().defaultTo(UserSecretType.Login);
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.UserSecret);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecret);
}
