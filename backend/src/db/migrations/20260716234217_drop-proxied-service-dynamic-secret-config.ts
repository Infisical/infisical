import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDynamicSecretConfig = await knex.schema.hasColumn(TableName.ProxiedServiceCredential, "dynamicSecretConfig");

  if (hasDynamicSecretConfig) {
    await knex.schema.alterTable(TableName.ProxiedServiceCredential, (t) => {
      t.dropColumn("dynamicSecretConfig");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDynamicSecretConfig = await knex.schema.hasColumn(TableName.ProxiedServiceCredential, "dynamicSecretConfig");

  if (!hasDynamicSecretConfig) {
    await knex.schema.alterTable(TableName.ProxiedServiceCredential, (t) => {
      t.jsonb("dynamicSecretConfig");
    });
  }
}
