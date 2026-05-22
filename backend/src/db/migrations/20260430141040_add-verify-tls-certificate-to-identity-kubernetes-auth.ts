import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "verifyTlsCertificate"))) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.boolean("verifyTlsCertificate").defaultTo(false).notNullable();
    });

    await knex(TableName.IdentityKubernetesAuth)
      .whereNotNull("encryptedKubernetesCaCertificate")
      .update({ verifyTlsCertificate: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "verifyTlsCertificate")) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.dropColumn("verifyTlsCertificate");
    });
  }
}
