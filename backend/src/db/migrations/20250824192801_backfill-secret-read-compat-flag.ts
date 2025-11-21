import { Knex } from "knex";

import { selectAllTableCols } from "@app/lib/knex";

import { TableName } from "../schemas";

const BATCH_SIZE = 100;

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "shouldCheckSecretPermission")) {
    // find all existing SecretApprovalPolicy rows to backfill shouldCheckSecretPermission flag
    const rows = await knex(TableName.SecretApprovalPolicy).select(selectAllTableCols(TableName.SecretApprovalPolicy));

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const ids = batch.map((row) => row.id);
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(
          `
          UPDATE ??
          SET ?? = true
          WHERE ?? IN (${ids.map(() => "?").join(",")})
          `,
          [TableName.SecretApprovalPolicy, "shouldCheckSecretPermission", "id", ids]
        );
      }
    }
  }
}

export async function down(): Promise<void> {}
