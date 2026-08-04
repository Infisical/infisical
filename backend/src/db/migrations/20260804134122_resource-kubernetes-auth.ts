import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ResourceKubernetesAuth))) {
    await knex.schema.createTable(TableName.ResourceKubernetesAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("authMethodId").notNullable().unique();
      t.foreign("authMethodId").references("id").inTable(TableName.ResourceAuthMethod).onDelete("CASCADE");
      t.string("kubernetesHost", 255).notNullable();
      t.binary("encryptedKubernetesCaCertificate").nullable();
      t.binary("encryptedKubernetesTokenReviewerJwt").nullable();
      t.string("allowedNamespaces", 1024).notNullable().defaultTo("");
      t.string("allowedNames", 1024).notNullable().defaultTo("");
      t.string("allowedAudience", 255).notNullable().defaultTo("");
      t.boolean("verifyTlsCertificate").notNullable().defaultTo(true);
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ResourceKubernetesAuth);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ResourceKubernetesAuth);
  await knex.schema.dropTableIfExists(TableName.ResourceKubernetesAuth);
}
