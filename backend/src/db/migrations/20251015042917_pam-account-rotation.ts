import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "rotationEnabled"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.boolean("rotationEnabled").notNullable().defaultTo(false);
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "rotationIntervalSeconds"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.integer("rotationIntervalSeconds").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "lastRotatedAt"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.timestamp("lastRotatedAt").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamResource, "encryptedRotationAccountCredentials"))) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.binary("encryptedRotationAccountCredentials").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamResource, "encryptedRotationAccountCredentials")) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("encryptedRotationAccountCredentials");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "rotationEnabled")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("rotationEnabled");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "rotationIntervalSeconds")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("rotationIntervalSeconds");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "lastRotatedAt")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("lastRotatedAt");
    });
  }
}
