import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.GatewayV2, "encryptedPamSessionKey"))) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.binary("encryptedPamSessionKey");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.GatewayV2, "encryptedPamSessionKey")) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.dropColumn("encryptedPamSessionKey");
    });
  }
}
