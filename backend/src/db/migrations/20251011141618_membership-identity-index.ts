import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasScopeColumn = await knex.schema.hasColumn(TableName.Membership, "scope");
  const hasActorIdentityColumn = await knex.schema.hasColumn(TableName.Membership, "actorIdentityId");
  if (hasScopeColumn && hasActorIdentityColumn) {
    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.index(["scope", "actorIdentityId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasScopeColumn = await knex.schema.hasColumn(TableName.Membership, "scope");
  const hasActorIdentityColumn = await knex.schema.hasColumn(TableName.Membership, "actorIdentityId");
  if (hasScopeColumn && hasActorIdentityColumn) {
    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.dropIndex(["scope", "actorIdentityId"]);
    });
  }
}
