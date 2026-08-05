import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.SecretApprovalPolicy);
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "bypassForMachineIdentities");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
        t.boolean("bypassForMachineIdentities").notNullable().defaultTo(true);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.SecretApprovalPolicy);
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "bypassForMachineIdentities");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
        t.dropColumn("bypassForMachineIdentities");
      });
    }
  }
}
