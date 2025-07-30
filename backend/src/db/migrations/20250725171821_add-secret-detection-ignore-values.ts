import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Project, "secretDetectionIgnoreValues"))) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.specificType("secretDetectionIgnoreValues", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Project, "secretDetectionIgnoreValues")) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("secretDetectionIgnoreValues");
    });
  }
}
