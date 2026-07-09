import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIndex = await knex.schema.hasTable(TableName.DynamicSecretLease).then(async (exists) => {
    if (!exists) return false;
    const indexes = await knex.raw(
      `SELECT indexname FROM pg_indexes WHERE tablename = '${TableName.DynamicSecretLease}'`
    );
    return indexes.rows.some(
      (row: { indexname: string }) => row.indexname === "dynamic_secret_leases_expire_at_index"
    );
  });

  if (!hasIndex) {
    await knex.schema.alterTable(TableName.DynamicSecretLease, (t) => {
      t.index("expireAt", "dynamic_secret_leases_expire_at_index");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.DynamicSecretLease, (t) => {
    t.dropIndex("expireAt", "dynamic_secret_leases_expire_at_index");
  });
}
