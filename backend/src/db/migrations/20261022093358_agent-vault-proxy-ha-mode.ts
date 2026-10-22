import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasMode = await knex.schema.hasColumn(TableName.AgentVaultProxy, "mode");
  const hasCertificate = await knex.schema.hasColumn(TableName.AgentVaultProxy, "rootCaCertificate");
  const hasPrivateKey = await knex.schema.hasColumn(TableName.AgentVaultProxy, "encryptedRootCaPrivateKey");

  await knex.schema.alterTable(TableName.AgentVaultProxy, (t) => {
    if (!hasMode) t.string("mode").notNullable().defaultTo("standard");
    if (!hasCertificate) t.text("rootCaCertificate").nullable();
    if (!hasPrivateKey) t.binary("encryptedRootCaPrivateKey").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasMode = await knex.schema.hasColumn(TableName.AgentVaultProxy, "mode");
  const hasCertificate = await knex.schema.hasColumn(TableName.AgentVaultProxy, "rootCaCertificate");
  const hasPrivateKey = await knex.schema.hasColumn(TableName.AgentVaultProxy, "encryptedRootCaPrivateKey");

  await knex.schema.alterTable(TableName.AgentVaultProxy, (t) => {
    if (hasMode) t.dropColumn("mode");
    if (hasCertificate) t.dropColumn("rootCaCertificate");
    if (hasPrivateKey) t.dropColumn("encryptedRootCaPrivateKey");
  });
}
