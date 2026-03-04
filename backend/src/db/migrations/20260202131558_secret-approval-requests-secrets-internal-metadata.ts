import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasInternalMetadataColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalRequestSecretV2,
    "internalMetadata"
  );

  if (!hasInternalMetadataColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.jsonb("internalMetadata").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasInternalMetadataColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalRequestSecretV2,
    "internalMetadata"
  );

  if (hasInternalMetadataColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.dropColumn("internalMetadata");
    });
  }
}
