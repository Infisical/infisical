import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEncryptedLeaseData = await knex.schema.hasColumn(TableName.DynamicSecretLease, "encryptedLeaseData");

  if (!hasEncryptedLeaseData) {
    await knex.schema.alterTable(TableName.DynamicSecretLease, (t) => {
      t.binary("encryptedLeaseData").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedLeaseData = await knex.schema.hasColumn(TableName.DynamicSecretLease, "encryptedLeaseData");

  if (hasEncryptedLeaseData) {
    await knex.schema.alterTable(TableName.DynamicSecretLease, (t) => {
      t.dropColumn("encryptedLeaseData");
    });
  }
}
