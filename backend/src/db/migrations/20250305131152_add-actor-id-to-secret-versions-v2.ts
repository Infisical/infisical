import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSecretVersionV2UserActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "userActorId");
  const hasSecretVersionV2IdentityActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "identityActorId");
  const hasSecretVersionV2ActorType = await knex.schema.hasColumn(TableName.SecretVersionV2, "actorType");

  if (!hasSecretVersionV2UserActorId) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.uuid("userActorId");
      t.foreign("userActorId").references("id").inTable(TableName.Users);
    });
  }

  if (!hasSecretVersionV2IdentityActorId) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.uuid("identityActorId");
      t.foreign("identityActorId").references("id").inTable(TableName.Identity);
    });
  }
  if (!hasSecretVersionV2ActorType) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.string("actorType");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSecretVersionV2UserActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "userActorId");
  const hasSecretVersionV2IdentityActorId = await knex.schema.hasColumn(TableName.SecretVersionV2, "identityActorId");
  const hasSecretVersionV2ActorType = await knex.schema.hasColumn(TableName.SecretVersionV2, "actorType");

  if (hasSecretVersionV2UserActorId) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.dropColumn("userActorId");
    });
  }

  if (hasSecretVersionV2IdentityActorId) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.dropColumn("identityActorId");
    });
  }

  if (hasSecretVersionV2ActorType) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.dropColumn("actorType");
    });
  }
}
