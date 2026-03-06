import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasResourceCol = await knex.schema.hasColumn(TableName.PamResource, "discoveryFingerprint");
  if (!hasResourceCol) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.string("discoveryFingerprint").nullable();
    });
  }

  const hasAccountCol = await knex.schema.hasColumn(TableName.PamAccount, "discoveryFingerprint");
  if (!hasAccountCol) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.string("discoveryFingerprint").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasResourceCol = await knex.schema.hasColumn(TableName.PamResource, "discoveryFingerprint");
  if (hasResourceCol) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("discoveryFingerprint");
    });
  }

  const hasAccountCol = await knex.schema.hasColumn(TableName.PamAccount, "discoveryFingerprint");
  if (hasAccountCol) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("discoveryFingerprint");
    });
  }
}
