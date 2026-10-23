import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.DelegatedApprovalRequests, "callbackAttempts"))) {
    await knex.schema.alterTable(TableName.DelegatedApprovalRequests, (t) => {
      t.integer("callbackAttempts").notNullable().defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.DelegatedApprovalRequests, "callbackAttempts")) {
    await knex.schema.alterTable(TableName.DelegatedApprovalRequests, (t) => {
      t.dropColumn("callbackAttempts");
    });
  }
}
