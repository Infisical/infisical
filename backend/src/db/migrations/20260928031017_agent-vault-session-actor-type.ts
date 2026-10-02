import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentVaultSession, "actorType");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
      t.string("actorType").nullable();
    });
  }

  // A session whose owner was deleted has lost both ids, so its snapshot tells them apart: mint records an
  // email only for a user.
  await knex.raw(
    `UPDATE ?? SET "actorType" = CASE
      WHEN "identityId" IS NOT NULL THEN 'machineIdentity'
      WHEN "userId" IS NOT NULL THEN 'user'
      WHEN "actorEmail" IS NOT NULL THEN 'user'
      ELSE 'machineIdentity'
    END
    WHERE "actorType" IS NULL`,
    [TableName.AgentVaultSession]
  );
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentVaultSession, "actorType");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
      t.dropColumn("actorType");
    });
  }
}
