import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "implicitSecretReadAccess"))) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.boolean("implicitSecretReadAccess").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "implicitSecretReadAccess")) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.dropColumn("implicitSecretReadAccess");
    });
  }
}
