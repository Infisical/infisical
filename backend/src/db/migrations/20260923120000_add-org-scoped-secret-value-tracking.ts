import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueOrgBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        // 64 chars = 32 bytes hex encoded (HMAC-SHA256 output)
        t.string("secretValueOrgBlindIndex", 64).nullable();
      });
    }
  }

  // Versions carry the digest too, because a folder rollback copies a version's columns back onto
  // the live secret.
  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueOrgBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.string("secretValueOrgBlindIndex", 64).nullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretV2)) {
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_secrets_v2_secret_value_org_blind_index
    ON ${TableName.SecretV2} ("secretValueOrgBlindIndex")
    WHERE "secretValueOrgBlindIndex" IS NOT NULL
  `);
  }

  // Whether every row in the organization carries the digest above, which is what makes searching by
  // value trustworthy. It defaults to false rather than true, and organization creation opts a new
  // one in explicitly: during a rolling deploy the old replicas keep serving after this runs, and
  // every secret they write carries no digest, so an organization they create is not complete
  // however new it is. A database default cannot tell the two apart; the application code can.
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.boolean("orgWideSecretValueTrackingEnabled").defaultTo(false).notNullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_secrets_v2_secret_value_org_blind_index`);

  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueOrgBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        t.dropColumn("secretValueOrgBlindIndex");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueOrgBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.dropColumn("secretValueOrgBlindIndex");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.dropColumn("orgWideSecretValueTrackingEnabled");
      });
    }
  }
}

// CONCURRENTLY requires running outside a transaction. Every step above is guarded by a hasColumn or
// IF NOT EXISTS check, which is what lets a partial failure be retried safely without one.
const config = { transaction: false };
export { config };
