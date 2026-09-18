import { Knex } from "knex";

import { TableName } from "../schemas";

// Widens SecretApprovalRequest.bypassReason from varchar(255) to text. Bypass reasons accept up to
// 1000 characters at the API layer (secret-approval-request-router), so the original varchar(255)
// rejects otherwise-valid input with a "value too long" error.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "bypassReason");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (table) => {
      table.text("bypassReason").nullable().alter();
    });
  }
}

// Intentionally a no-op: text is a superset of varchar(255), so widening needs no schema reversal.
// Narrowing back to varchar(255) would throw "value too long" on any reason already stored beyond
// 255 characters (exactly what this migration enables), wedging the rollback.
export async function down(): Promise<void> {}
