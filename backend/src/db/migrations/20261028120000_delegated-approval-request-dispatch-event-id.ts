import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.DelegatedApprovalRequests, "dispatchEventId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.DelegatedApprovalRequests, (t) => {
      t.uuid("dispatchEventId").notNullable().defaultTo(knex.fn.uuid());
    });
    // The default only backfills existing rows. The id must be the one the caller emits its event under, so
    // a create that omits it should fail rather than get an id no event carries.
    await knex.raw('ALTER TABLE ?? ALTER COLUMN "dispatchEventId" DROP DEFAULT', [TableName.DelegatedApprovalRequests]);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.DelegatedApprovalRequests, "dispatchEventId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.DelegatedApprovalRequests, (t) => {
      t.dropColumn("dispatchEventId");
    });
  }
}
