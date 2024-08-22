import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const doesNameExist = await knex.schema.hasColumn(TableName.SecretSharing, "name");
    if (!doesNameExist) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.string("name").nullable();
      });
    }

    const doesLastViewedAtExist = await knex.schema.hasColumn(TableName.SecretSharing, "lastViewedAt");
    if (!doesLastViewedAtExist) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.timestamp("lastViewedAt").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const doesNameExist = await knex.schema.hasColumn(TableName.SecretSharing, "name");
    if (doesNameExist) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.dropColumn("name");
      });
    }

    const doesLastViewedAtExist = await knex.schema.hasColumn(TableName.SecretSharing, "lastViewedAt");
    if (doesLastViewedAtExist) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.dropColumn("lastViewedAt");
      });
    }
  }
}
