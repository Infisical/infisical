import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ApprovalPolicySecretEnvironment))) return;

  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "secretPath" TYPE varchar(1024)`, [
    TableName.ApprovalPolicySecretEnvironment
  ]);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ApprovalPolicySecretEnvironment))) return;

  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "secretPath" TYPE varchar(255)`, [
    TableName.ApprovalPolicySecretEnvironment
  ]);
}
