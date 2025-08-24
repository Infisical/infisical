import { Knex } from "knex";
import { TableName } from "../schemas";
import { selectAllTableCols } from "@app/lib/knex";

const BATCH_SIZE = 100;

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "secretReadAccessCompat")) {
    // find all rows where kubernetesHost is null
    const rows = await knex(TableName.SecretApprovalPolicy).select(selectAllTableCols(TableName.SecretApprovalPolicy));

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop
        await knex(TableName.SecretApprovalPolicy)
          .whereIn(
            "id",
            batch.map((row) => row.id)
          )
          .update({ secretReadAccessCompat: true });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {}
