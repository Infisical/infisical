import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.NhiIdentity, "riskAcceptedAt");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.NhiIdentity, (t) => {
      t.datetime("riskAcceptedAt").nullable();
      t.uuid("riskAcceptedByUserId").nullable();
      t.text("riskAcceptedReason").nullable();
      t.datetime("riskAcceptedExpiresAt").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.NhiIdentity, "riskAcceptedAt");
  if (hasCol) {
    await knex.schema.alterTable(TableName.NhiIdentity, (t) => {
      t.dropColumn("riskAcceptedAt");
      t.dropColumn("riskAcceptedByUserId");
      t.dropColumn("riskAcceptedReason");
      t.dropColumn("riskAcceptedExpiresAt");
    });
  }
}
