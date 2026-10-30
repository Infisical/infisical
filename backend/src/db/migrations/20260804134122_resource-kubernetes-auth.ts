import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ResourceKubernetesAuth))) {
    await knex.schema.createTable(TableName.ResourceKubernetesAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("authMethodId").notNullable().unique();
      t.foreign("authMethodId").references("id").inTable(TableName.ResourceAuthMethod).onDelete("CASCADE");
      // Null when the review runs through a gateway using its own service account, which needs no address.
      t.string("kubernetesHost", 255).nullable();
      t.binary("encryptedKubernetesCaCertificate").nullable();
      t.binary("encryptedKubernetesTokenReviewerJwt").nullable();
      t.string("allowedNamespaces", 1024).notNullable().defaultTo("");
      t.string("allowedNames", 1024).notNullable().defaultTo("");
      t.string("allowedAudience", 255).notNullable().defaultTo("");
      t.boolean("verifyTlsCertificate").notNullable().defaultTo(true);
      t.string("tokenReviewMode", 32).notNullable().defaultTo("api");
      // Blocks deleting a gateway another one reviews through, rather than nulling the reference
      // and leaving a config that cannot authenticate. NO ACTION rather than RESTRICT because
      // RESTRICT is not deferrable in Postgres even when declared so, and the check has to run at
      // COMMIT: deleting an org cascades away both the reviewer gateway and the config pointing at
      // it, so a statement-time check fires before the cascade has removed the referencer.
      t.uuid("gatewayV2Id").nullable();
      t.foreign("gatewayV2Id").references("id").inTable(TableName.GatewayV2).deferrable("deferred");
      t.uuid("gatewayPoolId").nullable();
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).deferrable("deferred");
      t.timestamps(true, true, true);
    });

    // Partial: both are null except when the review is proxied, and the RESTRICT checks need them.
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS "resource_kubernetes_auths_gateway_v2_id_index" ON ${TableName.ResourceKubernetesAuth} ("gatewayV2Id") WHERE "gatewayV2Id" IS NOT NULL`
    );
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS "resource_kubernetes_auths_gateway_pool_id_index" ON ${TableName.ResourceKubernetesAuth} ("gatewayPoolId") WHERE "gatewayPoolId" IS NOT NULL`
    );

    await createOnUpdateTrigger(knex, TableName.ResourceKubernetesAuth);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ResourceKubernetesAuth);
  await knex.schema.dropTableIfExists(TableName.ResourceKubernetesAuth);
}
