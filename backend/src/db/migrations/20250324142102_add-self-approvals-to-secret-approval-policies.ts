import { Knex } from "knex";

import { TableName } from "../schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "selfApprovals"))) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.boolean("selfApprovals").notNullable().defaultTo(true);
    });
  }
  if (!(await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "selfApprovals"))) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.boolean("selfApprovals").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "selfApprovals")) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.dropColumn("selfApprovals");
    });
  }
  if (await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "selfApprovals")) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("selfApprovals");
    });
  }
}
