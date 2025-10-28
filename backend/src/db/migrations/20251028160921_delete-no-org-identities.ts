import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    const hasIdentityOrgCol = await tx.schema.hasColumn(TableName.Identity, "orgId");
    if (hasIdentityOrgCol) {
      await tx(TableName.Identity).whereNull("orgId").delete();
      await tx.schema.alterTable(TableName.Identity, (t) => {
        t.uuid("orgId").notNullable().alter();
      });
    }
  });
}

export async function down(): Promise<void> {}

const config = { transaction: false };
export { config };
