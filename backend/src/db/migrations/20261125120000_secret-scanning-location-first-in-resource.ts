import { Knex } from "knex";

import { TableName } from "../schemas";

const LOCATION = TableName.SecretScanningFindingLocation;

// Whether a location was its secret value's first in its resource, which is what makes it news for the scan that saved
// it. NULL, with no default, marks a location saved by a release that didn't know the column, which decided news by the
// finding's scanId instead.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(LOCATION, "isFirstInResource")) return;

  await knex.schema.alterTable(LOCATION, (t) => {
    t.boolean("isFirstInResource").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(LOCATION, "isFirstInResource"))) return;

  await knex.schema.alterTable(LOCATION, (t) => {
    t.dropColumn("isFirstInResource");
  });
}
