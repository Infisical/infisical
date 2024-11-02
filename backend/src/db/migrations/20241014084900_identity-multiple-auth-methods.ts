import { Knex } from "knex";

import { TableName } from "../schemas";

const BATCH_SIZE = 10000;

export async function up(knex: Knex): Promise<void> {
  const hasAuthMethodColumnAccessToken = await knex.schema.hasColumn(TableName.IdentityAccessToken, "authMethod");

  if (!hasAuthMethodColumnAccessToken) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.string("authMethod").nullable();
    });

    // Get total count of records to process
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore because count is a string
    const count = (await knex(TableName.IdentityAccessToken).count("id as count").first()) as { count: string };

    if (!count) {
      throw new Error("Failed to find count of identity access tokens");
    }

    const totalRecords = parseInt(count.count, 10);
    // Process in batches
    for (let offset = 0; offset < totalRecords; offset += BATCH_SIZE) {
      // ! Get the current access tokens to process
      // eslint-disable-next-line no-await-in-loop
      const batchIds = await knex(TableName.IdentityAccessToken)
        .select("id")
        .limit(BATCH_SIZE)
        .offset(offset)
        .pluck("id");

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

      // Log progress
      // eslint-disable-next-line no-console
      console.log(`Processed ${Math.min(offset + BATCH_SIZE, totalRecords)} of ${totalRecords} records`);
    }

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
