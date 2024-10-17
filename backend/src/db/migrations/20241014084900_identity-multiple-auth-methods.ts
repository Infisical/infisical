import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAuthMethodColumnAccessToken = await knex.schema.hasColumn(TableName.IdentityAccessToken, "authMethod");

  if (!hasAuthMethodColumnAccessToken) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.string("authMethod").nullable();
    });

    // Backfilling: Update the authMethod column in the IdentityAccessToken table to match the authMethod of the Identity
    await knex(TableName.IdentityAccessToken).update({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore because generate schema happens after this
      authMethod: knex(TableName.Identity)
        .select("authMethod")
        .whereRaw(`${TableName.IdentityAccessToken}."identityId" = ${TableName.Identity}.id`)
        .whereNotNull("authMethod")
        .first()
    });

    // ! We delete all access tokens where the identity has no auth method set!
    // ! Which means un-configured identities that for some reason have access tokens, will have their access tokens deleted.
    await knex(TableName.IdentityAccessToken)
      .whereNotExists((queryBuilder) => {
        void queryBuilder
          .select("id")
          .from(TableName.Identity)
          .whereRaw(`${TableName.IdentityAccessToken}."identityId" = ${TableName.Identity}.id`)
          .whereNotNull("authMethod");
      })
      .delete();

    // Finally we set the authMethod to notNullable after populating the column.
    // This will fail if the data is not populated correctly, so it's safe.
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.string("authMethod").notNullable().alter();
    });
  }

  // ! We aren't dropping the authMethod column from the Identity itself, because we wan't to be able to easily rollback for the time being.
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(knex: Knex): Promise<void> {
  const hasAuthMethodColumnAccessToken = await knex.schema.hasColumn(TableName.IdentityAccessToken, "authMethod");

  if (hasAuthMethodColumnAccessToken) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.dropColumn("authMethod");
    });
  }
}
