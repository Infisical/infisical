import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AppConnection)) {
    // we can't add the constraint back after up since there may be conflicting names so we do if exists
    await dropConstraintIfExists(TableName.AppConnection, "app_connections_orgid_name_unique", knex);

    if (!(await knex.schema.hasColumn(TableName.AppConnection, "projectId"))) {
      await knex.schema.alterTable(TableName.AppConnection, (t) => {
        t.string("projectId").nullable();
        t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
        t.unique(["name", "projectId"]);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AppConnection)) {
    if (await knex.schema.hasColumn(TableName.AppConnection, "projectId")) {
      await knex.schema.alterTable(TableName.AppConnection, (t) => {
        t.dropUnique(["name", "projectId"]);
        t.dropColumn("projectId");
      });
    }
  }
}
