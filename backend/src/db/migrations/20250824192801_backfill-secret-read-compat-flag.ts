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
        // @ts-expect-error because this field got removed later
        // eslint-disable-next-line no-await-in-loop
        await knex(TableName.SecretApprovalPolicy).whereIn("id", ids).update({ shouldCheckSecretPermission: true });
      }
    }
  }
}

export async function down(): Promise<void> {}
