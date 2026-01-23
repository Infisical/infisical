import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas/models";

const UNIQUE_NAME_ORG_CONNECTION_INDEX = "unique_name_org_app_connection";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AppConnection)) {
    // we can't add the constraint back after up since there may be conflicting names so we do if exists
    await dropConstraintIfExists(TableName.AppConnection, "app_connections_orgid_name_unique", knex);

    if (!(await knex.schema.hasColumn(TableName.AppConnection, "projectId"))) {
      await knex.schema.alterTable(TableName.AppConnection, (t) => {
        t.string("projectId").nullable();
        t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
        // unique name for project-level connections
        t.unique(["name", "projectId", "orgId"]);
      });

      // unique name for org-level connections
      await knex.raw(`
          CREATE UNIQUE INDEX ${UNIQUE_NAME_ORG_CONNECTION_INDEX} 
          ON ${TableName.AppConnection} ("name", "orgId") 
          WHERE "projectId" IS NULL
        `);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AppConnection)) {
    if (await knex.schema.hasColumn(TableName.AppConnection, "projectId")) {
      await knex.schema.alterTable(TableName.AppConnection, (t) => {
        t.dropUnique(["name", "projectId", "orgId"]);
        t.dropColumn("projectId");
      });
      await dropConstraintIfExists(TableName.AppConnection, UNIQUE_NAME_ORG_CONNECTION_INDEX, knex);
    }
  }
}
