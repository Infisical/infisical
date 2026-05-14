import { Knex } from "knex";

import { TableName } from "../schemas";

const SCOPE_COLUMN = "scope";
const IDENTITY_EXPIRES_INDEX = "identity_access_token_revocations_identityid_expiresat_index";

export async function up(knex: Knex): Promise<void> {
  const hasScope = await knex.schema.hasColumn(TableName.IdentityAccessTokenRevocation, SCOPE_COLUMN);
  if (!hasScope) {
    await knex.schema.alterTable(TableName.IdentityAccessTokenRevocation, (t) => {
      // Holds the per-marker scope key: clientSecretId UUID for client-secret revokes,
      // IdentityAuthMethod enum string for auth-method revokes. Null for legacy markers
      // (per-token and identity-wide) which key off `id` instead.
      t.string(SCOPE_COLUMN).nullable();
    });
  }

  // Validator changes from `WHERE id IN (?, ?)` to `WHERE identityId = ?`, so this
  // index covers the new hot path.
  await knex.schema.alterTable(TableName.IdentityAccessTokenRevocation, (t) => {
    t.index(["identityId", "expiresAt"], IDENTITY_EXPIRES_INDEX);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.IdentityAccessTokenRevocation, (t) => {
    t.dropIndex(["identityId", "expiresAt"], IDENTITY_EXPIRES_INDEX);
  });

  const hasScope = await knex.schema.hasColumn(TableName.IdentityAccessTokenRevocation, SCOPE_COLUMN);
  if (hasScope) {
    await knex.schema.alterTable(TableName.IdentityAccessTokenRevocation, (t) => {
      t.dropColumn(SCOPE_COLUMN);
    });
  }
}
