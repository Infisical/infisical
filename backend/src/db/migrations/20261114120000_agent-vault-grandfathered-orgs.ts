import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultGrandfatheredOrg))) {
    await knex.schema.createTable(TableName.AgentVaultGrandfatheredOrg, (t) => {
      // Root orgs only: a sub-org's Agent Vault access follows its root's plan.
      t.uuid("orgId").primary();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      // Set by the first purchase, so cancelling later doesn't make the org free again.
      t.datetime("endedAt", { useTz: true });
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultGrandfatheredOrg);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AgentVaultGrandfatheredOrg);
  await knex.schema.dropTableIfExists(TableName.AgentVaultGrandfatheredOrg);
}
