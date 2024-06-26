import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Project, "auditLogsRetentionDays"))) {
    await knex.schema.alterTable(TableName.Project, (tb) => {
      tb.integer("auditLogsRetentionDays").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Project, "auditLogsRetentionDays")) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("auditLogsRetentionDays");
    });
  }
}
