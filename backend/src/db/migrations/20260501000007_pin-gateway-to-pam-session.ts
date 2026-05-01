import { Knex } from "knex";

import { TableName } from "../schemas";

// PAM sessions used to read the gateway via JOIN on pam_resources.gatewayId.
// With pool-backed resources, the resource's gatewayId is null and a fresh
// member is picked at session-start. Pin that picked gateway to the session
// row so termination/audit/logging all see the same gateway throughout the
// session's lifetime.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamSession, "gatewayId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamSession, "gatewayId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.dropColumn("gatewayId");
    });
  }
}
