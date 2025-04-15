import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "dynamicSecretId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("dynamicSecretId");
      tb.foreign("dynamicSecretId").references("id").inTable(TableName.DynamicSecret).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ResourceMetadata, "dynamicSecretId")) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn("dynamicSecretId");
    });
  }
}
