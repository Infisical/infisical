import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // 1. Rename metadata → internalMetadata on pam_accounts
  if (await knex.schema.hasColumn(TableName.PamAccount, "metadata")) {
    await knex.schema.alterTable(TableName.PamAccount, (tb) => {
      tb.renameColumn("metadata", "internalMetadata");
    });
  }

  // 2. Add pamResourceId FK to resource_metadata
  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "pamResourceId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("pamResourceId");
      tb.foreign("pamResourceId").references("id").inTable(TableName.PamResource).onDelete("CASCADE");
      tb.index("pamResourceId");
    });
  }

  // 3. Add pamAccountId FK to resource_metadata
  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "pamAccountId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("pamAccountId");
      tb.foreign("pamAccountId").references("id").inTable(TableName.PamAccount).onDelete("CASCADE");
      tb.index("pamAccountId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse: drop pamAccountId from resource_metadata
  if (await knex.schema.hasColumn(TableName.ResourceMetadata, "pamAccountId")) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn("pamAccountId");
    });
  }

  // Reverse: drop pamResourceId from resource_metadata
  if (await knex.schema.hasColumn(TableName.ResourceMetadata, "pamResourceId")) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn("pamResourceId");
    });
  }

  // Reverse: rename internalMetadata → metadata on pam_accounts
  if (await knex.schema.hasColumn(TableName.PamAccount, "internalMetadata")) {
    await knex.schema.alterTable(TableName.PamAccount, (tb) => {
      tb.renameColumn("internalMetadata", "metadata");
    });
  }
}
