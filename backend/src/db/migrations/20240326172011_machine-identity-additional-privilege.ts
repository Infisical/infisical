import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityProjectAdditionalPrivilege))) {
    await knex.schema.createTable(TableName.IdentityProjectAdditionalPrivilege, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("slug", 60).notNullable();
      t.uuid("projectMembershipId").notNullable();
      t.foreign("projectMembershipId")
        .references("id")
        .inTable(TableName.IdentityProjectMembership)
        .onDelete("CASCADE");
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.jsonb("permissions").notNullable();
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityProjectAdditionalPrivilege);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.IdentityProjectAdditionalPrivilege);
  await knex.schema.dropTableIfExists(TableName.IdentityProjectAdditionalPrivilege);
}
