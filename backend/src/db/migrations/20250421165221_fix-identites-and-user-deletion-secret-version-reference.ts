import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
    table.dropForeign(["userActorId"]);
    table.dropForeign(["identityActorId"]);
  });

  await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
    table.foreign("userActorId").references("id").inTable(TableName.Users).onDelete("SET NULL");

    table.foreign("identityActorId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
    table.dropForeign(["userActorId"]);
    table.dropForeign(["identityActorId"]);
  });

  await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
    table.foreign("userActorId").references("id").inTable(TableName.Users);

    table.foreign("identityActorId").references("id").inTable(TableName.Identity);
  });
}
