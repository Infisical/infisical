import { Knex } from "knex";

import { getConfig } from "@app/lib/config/env";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const appCfg = getConfig();
  if (!(await knex.schema.hasColumn(TableName.Organization, "userTokenExpiration"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.string("userTokenExpiration");
    });
    await knex(TableName.Organization).update({ userTokenExpiration: appCfg.JWT_REFRESH_LIFETIME });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "userTokenExpiration")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("userTokenExpiration");
    });
  }
}
