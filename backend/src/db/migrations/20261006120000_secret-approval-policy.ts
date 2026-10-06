import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const GRANT_ID_UNIQUE_INDEX = "additional_privileges_grant_id_unique";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "grantId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.uuid("grantId").nullable();
      t.foreign("grantId").references("id").inTable(TableName.ApprovalRequestGrants).onDelete("SET NULL");
      t.unique(["grantId"], { indexName: GRANT_ID_UNIQUE_INDEX });
    });
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicySecretEnvironment))) {
    await knex.schema.createTable(TableName.ApprovalPolicySecretEnvironment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().index();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.uuid("envId").notNullable().index();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");

      t.string("secretPath").notNullable();

      t.timestamps(true, true, true);
      t.unique(["policyId", "envId", "secretPath"]);
    });

    await createOnUpdateTrigger(knex, TableName.ApprovalPolicySecretEnvironment);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicySecretEnvironment);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicySecretEnvironment);

  const hasColumn = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "grantId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.dropUnique(["grantId"], GRANT_ID_UNIQUE_INDEX);
      t.dropForeign("grantId");
      t.dropColumn("grantId");
    });
  }
}
