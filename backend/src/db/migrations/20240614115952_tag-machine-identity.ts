import { Knex } from "knex";

import { ActorType } from "@app/services/auth/auth-type";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCreatedByActorType = await knex.schema.hasColumn(TableName.SecretTag, "createdByActorType");
  await knex.schema.alterTable(TableName.SecretTag, (tb) => {
    if (!hasCreatedByActorType) {
      tb.string("createdByActorType").notNullable().defaultTo(ActorType.USER);
      tb.dropForeign("createdBy");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasCreatedByActorType = await knex.schema.hasColumn(TableName.SecretTag, "createdByActorType");
  await knex.schema.alterTable(TableName.SecretTag, (tb) => {
    if (hasCreatedByActorType) {
      tb.dropColumn("createdByActorType");
      tb.foreign("createdBy").references("id").inTable(TableName.Users).onDelete("SET NULL");
    }
  });
}
