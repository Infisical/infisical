import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDynamicSecretName = await knex.schema.hasColumn(TableName.ProxiedServiceCredential, "dynamicSecretName");

  await knex.schema.alterTable(TableName.ProxiedServiceCredential, (t) => {
    if (!hasDynamicSecretName) {
      t.string("dynamicSecretName");
      t.string("dynamicSecretField");
      t.jsonb("dynamicSecretConfig");
    }

    t.string("secretKey").nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.ProxiedServiceCredential).whereNull("secretKey").delete();

  const hasDynamicSecretName = await knex.schema.hasColumn(TableName.ProxiedServiceCredential, "dynamicSecretName");

  await knex.schema.alterTable(TableName.ProxiedServiceCredential, (t) => {
    if (hasDynamicSecretName) {
      t.dropColumn("dynamicSecretName");
      t.dropColumn("dynamicSecretField");
      t.dropColumn("dynamicSecretConfig");
    }
    t.string("secretKey").notNullable().alter();
  });
}
