import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamResource, "encryptedResourceMetadata"))) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.binary("encryptedResourceMetadata").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamResource, "encryptedResourceMetadata")) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("encryptedResourceMetadata");
    });
  }
}
