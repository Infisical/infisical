import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.GroupProjectUserAdditionalPrivilege))) {
    await knex.schema.createTable(TableName.GroupProjectUserAdditionalPrivilege, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("slug", 60).notNullable();

      t.uuid("groupProjectMembershipId").notNullable();
      t.foreign("groupProjectMembershipId")
        .references("id")
        .inTable(TableName.GroupProjectMembership)
        .onDelete("CASCADE");

      t.uuid("requestedByUserId").notNullable();
      t.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.jsonb("permissions").notNullable();
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.GroupProjectUserAdditionalPrivilege);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.GroupProjectUserAdditionalPrivilege);
  await knex.schema.dropTableIfExists(TableName.GroupProjectUserAdditionalPrivilege);
}
