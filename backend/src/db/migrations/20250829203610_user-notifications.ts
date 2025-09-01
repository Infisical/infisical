import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserNotifications))) {
    const createTableSql = knex.schema
      .createTable(TableName.UserNotifications, (t) => {
        t.uuid("id").defaultTo(knex.fn.uuid());
        t.uuid("userId").notNullable();

        t.string("type").notNullable();
        t.string("title").notNullable(); // Markdown
        t.text("body").nullable(); // Markdown
        t.string("link").nullable();
        t.boolean("isRead").notNullable().defaultTo(false);

        t.timestamps(true, true, true);

        t.primary(["id", "createdAt"]);
      })
      .toString();

    await knex.schema.raw(`
        ${createTableSql} PARTITION BY RANGE ("createdAt");
    `);

    await knex.schema.raw(
      `CREATE TABLE ${TableName.UserNotifications}_default PARTITION OF ${TableName.UserNotifications} DEFAULT`
    );

    await knex.schema.alterTable(TableName.UserNotifications, (t) => {
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.index("type");
      t.index(["userId", "isRead"]);
      t.index(["userId", "createdAt"]);
    });

    await createOnUpdateTrigger(knex, TableName.UserNotifications);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserNotifications);
  await dropOnUpdateTrigger(knex, TableName.UserNotifications);
}
