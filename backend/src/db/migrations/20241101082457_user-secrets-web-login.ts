import { Knex } from "knex";
import { createOnUpdateTrigger } from "../utils";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecretWebLogin))) {
    await knex.schema.createTable(TableName.UserSecretWebLogin, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.text("username").nullable();
      t.text("password").notNullable();
      t.text("website").nullable();
      t.text("notes").nullable();
      t.text("iv").nullable();
      t.text("tag").nullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.UserSecret).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.UserSecretWebLogin);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecretWebLogin);
}
