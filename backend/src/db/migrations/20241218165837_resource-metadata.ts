import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ResourceMetadata))) {
    await knex.schema.createTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("key").notNullable();
      tb.string("value", 1020).notNullable();
      tb.uuid("orgId").notNullable();
      tb.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      tb.uuid("userId");
      tb.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      tb.uuid("identityId");
      tb.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      tb.uuid("secretId");
      tb.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      tb.timestamps(true, true, true);
    });
  }

  const hasSecretMetadataField = await knex.schema.hasColumn(TableName.SecretApprovalRequestSecretV2, "secretMetadata");
  if (!hasSecretMetadataField) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.jsonb("secretMetadata");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ResourceMetadata);

  const hasSecretMetadataField = await knex.schema.hasColumn(TableName.SecretApprovalRequestSecretV2, "secretMetadata");
  if (hasSecretMetadataField) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.dropColumn("secretMetadata");
    });
  }
}
