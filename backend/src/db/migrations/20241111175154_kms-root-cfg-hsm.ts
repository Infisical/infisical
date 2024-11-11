import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEncryptionStrategy = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "encryptionStrategy");
  const hasTimestampsCol = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "createdAt");

  await knex.schema.alterTable(TableName.KmsServerRootConfig, (t) => {
    if (!hasEncryptionStrategy) t.string("encryptionStrategy").defaultTo("SOFTWARE");
    if (!hasTimestampsCol) t.timestamps(true, true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptionStrategy = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "encryptionStrategy");
  const hasTimestampsCol = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "createdAt");

  await knex.schema.alterTable(TableName.KmsServerRootConfig, (t) => {
    if (hasEncryptionStrategy) t.dropColumn("encryptionStrategy");
    if (hasTimestampsCol) t.dropTimestamps(true);
  });
}
