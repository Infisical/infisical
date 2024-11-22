import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // ? ACCESS APPROVALS
  const accessApprovalPolicyHasSecretPathColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "secretPath"
  );
  const accessApprovalPolicyHasNewSecretPathsColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "secretPaths"
  );

  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
    if (!accessApprovalPolicyHasNewSecretPathsColumn) {
      t.jsonb("secretPaths").notNullable().defaultTo("[]");
    }
  });

  if (accessApprovalPolicyHasSecretPathColumn) {
    // Move the existing secretPath values to the new secretPaths column
    await knex(TableName.AccessApprovalPolicy)
      .select("id", "secretPath")
      .whereNotNull("secretPath")
      .whereNot("secretPath", "")
      .update({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore -- secretPaths are not in the type definition yet
        secretPaths: knex.raw("to_jsonb(ARRAY[??])", ["secretPath"])
      });
  }
  // TODO(daniel): Drop the secretPath column in the future when this has stabilized

  // ? SECRET CHANGE APPROVALS
  const secretChangeApprovalPolicyHasSecretPathColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicy,
    "secretPath"
  );
  const secretChangeApprovalPolicyHasNewSecretPathsColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicy,
    "secretPaths"
  );

  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
    if (!secretChangeApprovalPolicyHasNewSecretPathsColumn) {
      t.jsonb("secretPaths").notNullable().defaultTo("[]");
    }
  });

  if (secretChangeApprovalPolicyHasSecretPathColumn) {
    // Move the existing secretPath values to the new secretPaths column
    await knex(TableName.SecretApprovalPolicy)
      .select("id", "secretPath")
      .whereNotNull("secretPath")
      .whereNot("secretPath", "")
      .update({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore -- secretPaths are not in the type definition yet
        secretPaths: knex.raw("to_jsonb(ARRAY[??])", ["secretPath"])
      });
  }

  // TODO(daniel): Drop the secretPath column in the future when this has stabilized.
}

export async function down(knex: Knex): Promise<void> {
  // TODO(daniel): Restore the secretPath columns when we add dropping in the up migration. (needs to be re-filled with data from the `secretPaths` column)

  const accessApprovalPolicyHasNewSecretsPathsColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "secretPaths"
  );
  const secretChangeApprovalPolicyHasSecretPathColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicy,
    "secretPaths"
  );

  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
    if (accessApprovalPolicyHasNewSecretsPathsColumn) {
      t.dropColumn("secretPaths");
    }
  });

  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
    if (secretChangeApprovalPolicyHasSecretPathColumn) {
      t.dropColumn("secretPaths");
    }
  });
}
