import { Knex } from "knex";

import { TableName } from "../schemas";

const BATCH_SIZE = 10_000;

export async function up(knex: Knex): Promise<void> {
  const hasAuthMethodColumnAccessToken = await knex.schema.hasColumn(TableName.IdentityAccessToken, "authMethod");

  if (!hasAuthMethodColumnAccessToken) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.string("authMethod").nullable();
    });

    // first we remove identities without auth method that is unused
    // ! We delete all access tokens where the identity has no auth method set!
    // ! Which means un-configured identities that for some reason have access tokens, will have their access tokens deleted.
    await knex(TableName.IdentityAccessToken)
      .leftJoin(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityAccessToken}.identityId`)
      .whereNull(`${TableName.Identity}.authMethod`)
      .delete();

    let nullableAccessTokens = await knex(TableName.IdentityAccessToken)
      .whereNull("authMethod")
      .limit(BATCH_SIZE)
      .select("id");
    let totalUpdated = 0;

    do {
      const batchIds = nullableAccessTokens.map((token) => token.id);

      // ! Update the auth method column in batches for the current batch
      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.IdentityAccessToken)
        .whereIn("id", batchIds)
        .update({
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore because generate schema happens after this
          authMethod: knex(TableName.Identity)
            .select("authMethod")
            .whereRaw(`${TableName.IdentityAccessToken}."identityId" = ${TableName.Identity}.id`)
            .whereNotNull("authMethod")
            .first()
        });

      // eslint-disable-next-line no-await-in-loop
      nullableAccessTokens = await knex(TableName.IdentityAccessToken)
        .whereNull("authMethod")
        .limit(BATCH_SIZE)
        .select("id");

      totalUpdated += batchIds.length;
      // eslint-disable-next-line no-console
      console.log(`Updated ${batchIds.length} access tokens in batch <> Total updated: ${totalUpdated}`);
    } while (nullableAccessTokens.length > 0);

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

const config = { transaction: false };
export { config };
