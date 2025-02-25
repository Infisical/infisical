import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityProfile))) {
    await knex.schema.createTable(TableName.IdentityProfile, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.text("temporalProfile").notNullable(); // access pattern or frequency
      t.text("scopeProfile").notNullable(); // scope of usage - are they accessing development environment secrets. which paths? are they doing mainly admin work?
      t.text("usageProfile").notNullable(); // method of usage

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.IdentityProfile);
  }

  if (!(await knex.schema.hasTable(TableName.AutomatedSecurityReports))) {
    await knex.schema.createTable(TableName.AutomatedSecurityReports, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("profileId").notNullable();
      t.foreign("profileId").references("id").inTable(TableName.IdentityProfile).onDelete("CASCADE");

      t.jsonb("event").notNullable();

      t.string("remarks").notNullable();
      t.string("severity").notNullable();
      t.string("status").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AutomatedSecurityReports);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityProfile);

  await knex.schema.dropTableIfExists(TableName.AutomatedSecurityReports);
}
