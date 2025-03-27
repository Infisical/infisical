import { Knex } from "knex";

import { TableName } from "../schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "allowedSelfApprovals"))) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.boolean("allowedSelfApprovals").notNullable().defaultTo(true);
    });
  }
  if (!(await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "allowedSelfApprovals"))) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.boolean("allowedSelfApprovals").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "allowedSelfApprovals")) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.dropColumn("allowedSelfApprovals");
    });
  }
  if (await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "allowedSelfApprovals")) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("allowedSelfApprovals");
    });
  }
}
