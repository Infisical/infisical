import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityKubernetesAuth))) {
    await knex.schema.createTable(TableName.IdentityKubernetesAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.bigInteger("accessTokenTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenMaxTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
      t.jsonb("accessTokenTrustedIps").notNullable();
      t.timestamps(true, true, true);
      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.string("kubernetesHost").notNullable();
      t.text("encryptedCaCert").notNullable();
      t.string("caCertIV").notNullable();
      t.string("caCertTag").notNullable();
      t.text("encryptedTokenReviewerJwt").notNullable();
      t.string("tokenReviewerJwtIV").notNullable();
      t.string("tokenReviewerJwtTag").notNullable();
      t.string("allowedNamespaces").notNullable();
      t.string("allowedNames").notNullable();
      t.string("allowedAudience").notNullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityKubernetesAuth);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityKubernetesAuth);
  await dropOnUpdateTrigger(knex, TableName.IdentityKubernetesAuth);
}
