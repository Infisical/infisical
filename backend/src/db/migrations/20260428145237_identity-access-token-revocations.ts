import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityAccessTokenRevocation)) {
    return;
  }

  await knex.schema.createTable(TableName.IdentityAccessTokenRevocation, (t) => {
    t.uuid("id").primary();
    t.uuid("identityId").notNullable();
    t.timestamp("expiresAt", { useTz: true }).notNullable();
    // Populated for identity-wide revoke-all markers (id == identityId);
    // null for per-token revocations. Stored so runtime validation can
    // compare the JWT iat against the exact revocation time.
    t.timestamp("revokedAt", { useTz: true }).nullable();
    t.timestamps(true, true, true);
    t.index("expiresAt");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityAccessTokenRevocation);
}
