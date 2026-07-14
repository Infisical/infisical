import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDynamicSecretName = await knex.schema.hasColumn(TableName.ProxiedServiceCredential, "dynamicSecretName");

  await knex.schema.alterTable(TableName.ProxiedServiceCredential, (t) => {
    if (!hasDynamicSecretName) {
      // Name-based reference to a dynamic secret in the credential's own folder.
      // Intentionally NO FK to dynamic_secrets: matches secretKey's self-heal semantics
      // (a deleted-then-recreated dynamic secret with the same name re-links automatically).
      t.text("dynamicSecretName");
      t.text("dynamicSecretField");
      t.jsonb("dynamicSecretConfig");
    }

    // A credential now references either a static secret (secretKey) or a dynamic secret
    // (dynamicSecretName), so secretKey can no longer be NOT NULL. The "exactly one of" rule
    // is enforced at the Zod/application layer.
    t.string("secretKey").nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Dynamic-only rows have a null secretKey and would violate the restored NOT NULL constraint.
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
