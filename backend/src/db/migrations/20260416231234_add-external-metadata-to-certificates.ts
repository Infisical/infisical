import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Certificate, "externalMetadata");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.jsonb("externalMetadata").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    if (await knex.schema.hasColumn(TableName.Certificate, "externalMetadata")) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.dropColumn("externalMetadata");
      });
    }
  }
}
