import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamResource, "encryptedCaPrivateKey"))) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.binary("encryptedCaPrivateKey").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamResource, "caPublicKey"))) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.text("caPublicKey").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamResource, "caKeyAlgorithm"))) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.string("caKeyAlgorithm").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamResource, "encryptedCaPrivateKey")) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("encryptedCaPrivateKey");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamResource, "caPublicKey")) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("caPublicKey");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamResource, "caKeyAlgorithm")) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("caKeyAlgorithm");
    });
  }
}
