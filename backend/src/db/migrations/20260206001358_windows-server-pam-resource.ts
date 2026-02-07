import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Add adServerResourceId to pam_resources (optional reference to another resource for AD Server linkage)
  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasAdServerResourceId = await knex.schema.hasColumn(TableName.PamResource, "adServerResourceId");
    if (!hasAdServerResourceId) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.uuid("adServerResourceId").nullable();
        t.foreign("adServerResourceId").references("id").inTable(TableName.PamResource).onDelete("SET NULL");
      });
    }
  }

  // Add metadata (JSONB, not encrypted) to pam_accounts
  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasMetadata = await knex.schema.hasColumn(TableName.PamAccount, "metadata");
    if (!hasMetadata) {
      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.jsonb("metadata").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasAdServerResourceId = await knex.schema.hasColumn(TableName.PamResource, "adServerResourceId");
    if (hasAdServerResourceId) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.dropColumn("adServerResourceId");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasMetadata = await knex.schema.hasColumn(TableName.PamAccount, "metadata");
    if (hasMetadata) {
      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.dropColumn("metadata");
      });
    }
  }
}
