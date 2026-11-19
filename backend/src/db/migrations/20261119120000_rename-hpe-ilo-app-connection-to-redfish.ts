import { Knex } from "knex";

import { TableName } from "../schemas";

// Literals rather than AppConnection.Redfish: the old slug is no longer in the enum, and the migration must keep
// meaning the same thing if the enum changes again
const LEGACY_APP = "hpe-ilo";
const APP = "redfish";

export async function up(knex: Knex): Promise<void> {
  await knex(TableName.AppConnection).where({ app: LEGACY_APP }).update({ app: APP });
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.AppConnection).where({ app: APP }).update({ app: LEGACY_APP });
}
