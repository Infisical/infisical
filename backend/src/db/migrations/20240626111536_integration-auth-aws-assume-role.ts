import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAwsAssumeRoleCipherText = await knex.schema.hasColumn(
    TableName.IntegrationAuth,
    "awsAssumeIamRoleArnCipherText"
  );
  const hasAwsAssumeRoleIV = await knex.schema.hasColumn(TableName.IntegrationAuth, "awsAssumeIamRoleArnIV");
  const hasAwsAssumeRoleTag = await knex.schema.hasColumn(TableName.IntegrationAuth, "awsAssumeIamRoleArnTag");
  if (await knex.schema.hasTable(TableName.IntegrationAuth)) {
    await knex.schema.alterTable(TableName.IntegrationAuth, (t) => {
      if (!hasAwsAssumeRoleCipherText) t.text("awsAssumeIamRoleArnCipherText");
      if (!hasAwsAssumeRoleIV) t.text("awsAssumeIamRoleArnIV");
      if (!hasAwsAssumeRoleTag) t.text("awsAssumeIamRoleArnTag");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAwsAssumeRoleCipherText = await knex.schema.hasColumn(
    TableName.IntegrationAuth,
    "awsAssumeIamRoleArnCipherText"
  );
  const hasAwsAssumeRoleIV = await knex.schema.hasColumn(TableName.IntegrationAuth, "awsAssumeIamRoleArnIV");
  const hasAwsAssumeRoleTag = await knex.schema.hasColumn(TableName.IntegrationAuth, "awsAssumeIamRoleArnTag");
  if (await knex.schema.hasTable(TableName.IntegrationAuth)) {
    await knex.schema.alterTable(TableName.IntegrationAuth, (t) => {
      if (hasAwsAssumeRoleCipherText) t.dropColumn("awsAssumeIamRoleArnCipherText");
      if (hasAwsAssumeRoleIV) t.dropColumn("awsAssumeIamRoleArnIV");
      if (hasAwsAssumeRoleTag) t.dropColumn("awsAssumeIamRoleArnTag");
    });
  }
}
