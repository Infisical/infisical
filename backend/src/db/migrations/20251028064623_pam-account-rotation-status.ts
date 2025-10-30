import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "rotationStatus"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.string("rotationStatus").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "encryptedLastRotationMessage"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.binary("encryptedLastRotationMessage").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamAccount, "rotationStatus")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("rotationStatus");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "encryptedLastRotationMessage")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("encryptedLastRotationMessage");
    });
  }
}
