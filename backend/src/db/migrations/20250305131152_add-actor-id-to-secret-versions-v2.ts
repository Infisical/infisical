import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretVersionV2, "userActorId"))) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.uuid("userActorId");
      t.foreign("userActorId").references("id").inTable(TableName.Users);
      t.uuid("identityActorId");
      t.foreign("identityActorId").references("id").inTable(TableName.Identity);
      t.string("actorType");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretVersionV2, "userActorId")) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.dropColumn("userActorId");
      t.dropColumn("identityActorId");
      t.dropColumn("actorType");
    });
  }
}
