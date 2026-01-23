import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas/models";

const CONSTRAINT_NAME = "unique_pki_acme_account_public_key_and_profile_id";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAcmeAccount)) {
    const hasProfileId = await knex.schema.hasColumn(TableName.PkiAcmeAccount, "profileId");
    const hasPublicKeyThumbprint = await knex.schema.hasColumn(TableName.PkiAcmeAccount, "publicKeyThumbprint");

    if (hasProfileId && hasPublicKeyThumbprint) {
      await knex.schema.alterTable(TableName.PkiAcmeAccount, (table) => {
        table.unique(["profileId", "publicKeyThumbprint"], { indexName: CONSTRAINT_NAME });
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAcmeAccount)) {
    const hasProfileId = await knex.schema.hasColumn(TableName.PkiAcmeAccount, "profileId");
    const hasPublicKeyThumbprint = await knex.schema.hasColumn(TableName.PkiAcmeAccount, "publicKeyThumbprint");

    await knex.schema.alterTable(TableName.PkiAcmeAccount, async () => {
      if (hasProfileId && hasPublicKeyThumbprint) {
        await dropConstraintIfExists(TableName.PkiAcmeAccount, CONSTRAINT_NAME, knex);
      }
    });
  }
}
