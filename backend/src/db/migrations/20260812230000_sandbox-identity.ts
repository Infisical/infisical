import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIdentity = await knex.schema.hasColumn(TableName.Sandbox, "identityId");

  if (!hasIdentity) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      // Each sandbox gets its own machine identity so PAM access is attributable to that sandbox and
      // can be revoked with it. No FK: the identity is reprovisioned if it is deleted out from under us.
      t.uuid("identityId");
      t.string("identityClientId");
      t.binary("encryptedIdentityClientSecret");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIdentity = await knex.schema.hasColumn(TableName.Sandbox, "identityId");

  if (hasIdentity) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      t.dropColumn("identityId");
      t.dropColumn("identityClientId");
      t.dropColumn("encryptedIdentityClientSecret");
    });
  }
}
