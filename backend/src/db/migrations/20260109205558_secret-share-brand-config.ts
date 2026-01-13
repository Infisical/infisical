import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasConfigColumn = await knex.schema.hasColumn(TableName.Organization, "secretShareBrandConfig");
  if (!hasConfigColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.jsonb("secretShareBrandConfig").nullable();
    });
  }

  // For storing logo/favicon images
  const hasAssetsTable = await knex.schema.hasTable(TableName.SecretShareBrandingAsset);
  if (!hasAssetsTable) {
    await knex.schema.createTable(TableName.SecretShareBrandingAsset, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("assetType").notNullable(); // 'logo' or 'favicon'
      t.binary("data").notNullable();
      t.string("contentType").notNullable();
      t.integer("size").notNullable();
      t.timestamps(true, true, true);
      t.unique(["orgId", "assetType"]);
    });

    await createOnUpdateTrigger(knex, TableName.SecretShareBrandingAsset);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAssetsTable = await knex.schema.hasTable(TableName.SecretShareBrandingAsset);
  if (hasAssetsTable) {
    await knex.schema.dropTable(TableName.SecretShareBrandingAsset);
    await dropOnUpdateTrigger(knex, TableName.SecretShareBrandingAsset);
  }

  const hasConfigColumn = await knex.schema.hasColumn(TableName.Organization, "secretShareBrandConfig");
  if (hasConfigColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("secretShareBrandConfig");
    });
  }
}
