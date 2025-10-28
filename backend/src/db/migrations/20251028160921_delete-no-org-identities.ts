import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  await knex.transaction(async (tx) => {
    try {
      await tx.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      const hasIdentityOrgCol = await tx.schema.hasColumn(TableName.Identity, "orgId");
      if (hasIdentityOrgCol) {
        await tx(TableName.Identity).whereNull("orgId").delete();
        await tx.schema.alterTable(TableName.Identity, (t) => {
          t.uuid("orgId").notNullable().alter();
        });
      }
    } finally {
      await tx.raw(`SET statement_timeout = '${originalTimeout}'`);
    }
  });
}

export async function down(): Promise<void> {}

const config = { transaction: false };
export { config };
