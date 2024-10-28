import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsEncryptedByHsmCol = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "isEncryptedByHsm");
  const hasTimestampsCol = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "createdAt");

  await knex.schema.alterTable(TableName.KmsServerRootConfig, (t) => {
    if (!hasIsEncryptedByHsmCol) t.boolean("isEncryptedByHsm").defaultTo(false).notNullable();
    if (!hasTimestampsCol) t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasIsEncryptedByHsmCol = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "isEncryptedByHsm");
  const hasTimestampsCol = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "createdAt");

  await knex.schema.alterTable(TableName.KmsServerRootConfig, (t) => {
    if (hasIsEncryptedByHsmCol) t.dropColumn("isEncryptedByHsm");
    if (hasTimestampsCol) t.dropTimestamps(true);
  });
}
