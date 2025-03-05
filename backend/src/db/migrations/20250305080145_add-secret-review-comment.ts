import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "comment"))) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (t) => {
      t.string("comment");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalRequestReviewer, "comment")) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestReviewer, (t) => {
      t.dropColumn("comment");
    });
  }
}
