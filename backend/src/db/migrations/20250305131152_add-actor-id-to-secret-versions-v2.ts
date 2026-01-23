import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasSecretVersionV2UserActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "userActorId");
    const hasSecretVersionV2IdentityActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "identityActorId");
    const hasSecretVersionV2ActorType = await knex.schema.hasColumn(TableName.SecretVersionV2, "actorType");

    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      if (!hasSecretVersionV2UserActorId) {
        t.uuid("userActorId");
        t.foreign("userActorId").references("id").inTable(TableName.Users);
      }
      if (!hasSecretVersionV2IdentityActorId) {
        t.uuid("identityActorId");
        t.foreign("identityActorId").references("id").inTable(TableName.Identity);
      }
      if (!hasSecretVersionV2ActorType) {
        t.string("actorType");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasSecretVersionV2UserActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "userActorId");
    const hasSecretVersionV2IdentityActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "identityActorId");
    const hasSecretVersionV2ActorType = await knex.schema.hasColumn(TableName.SecretVersionV2, "actorType");

    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      if (hasSecretVersionV2UserActorId) {
        t.dropColumn("userActorId");
      }
      if (hasSecretVersionV2IdentityActorId) {
        t.dropColumn("identityActorId");
      }
      if (hasSecretVersionV2ActorType) {
        t.dropColumn("actorType");
      }
    });
  }
}
