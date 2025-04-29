import { Knex } from "knex";

import { getConfig } from "@app/lib/config/env";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const appCfg = getConfig();
  const tokenDuration = appCfg?.JWT_REFRESH_LIFETIME;

  if (!(await knex.schema.hasColumn(TableName.Organization, "userTokenExpiration"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.string("userTokenExpiration");
    });
    if (tokenDuration) {
      await knex(TableName.Organization).update({ userTokenExpiration: tokenDuration });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "userTokenExpiration")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("userTokenExpiration");
    });
  }
}
