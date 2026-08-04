import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SignupOnboardingResponse))) {
    await knex.schema.createTable(TableName.SignupOnboardingResponse, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.index("orgId");

      // Answers arrive across separate requests, merged into one row per signup.
      t.unique(["userId", "orgId"]);

      // null = question not answered yet; [] = "just exploring".
      t.specificType("selectedProducts", "text[]");
      t.boolean("isExploring");
      t.string("launchDestination");
      t.string("attributionSource", 512);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SignupOnboardingResponse);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SignupOnboardingResponse);
  await dropOnUpdateTrigger(knex, TableName.SignupOnboardingResponse);
}
