import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE = "gateway_enrollment_tokens";

export async function up(knex: Knex): Promise<void> {
  // 1. Rename gateway_enrollment_tokens -> resource_token_auths (column-compatible).
  const hasOldEnrollmentTokensTable = await knex.schema.hasTable(OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
  const hasNewEnrollmentTokensTable = await knex.schema.hasTable(TableName.ResourceTokenAuth);
  if (hasOldEnrollmentTokensTable && !hasNewEnrollmentTokensTable) {
    await knex.schema.renameTable(OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE, TableName.ResourceTokenAuth);
  }

  // 2. resource_auth_methods: registry of which auth method each resource is currently
  // using. Single source of truth for "this resource uses this method" — config tables
  // (resource_aws_auths) and credential tables (resource_token_auths) reference
  // this row's id rather than carrying the resource FK themselves.
  //
  // gatewayId is nullable so this table can hold rows for other resource types in the
  // future (each gets its own nullable FK column — matches the resource_metadata
  // convention used elsewhere in the schema).
  //
  // The "one method per gateway" rule is encoded via a *partial* unique index rather
  // than a strict UNIQUE constraint, so additional resource types can co-exist on this
  // table with their own constraint shape:
  //
  //   - Single-method resources (one method active per resource at a time):
  //       CREATE UNIQUE INDEX one_method_per_<resource>
  //         ON resource_auth_methods (<resource>Id)
  //         WHERE <resource>Id IS NOT NULL;
  //
  //   - Multi-method resources (multiple methods may be active at once, but each
  //     method must appear at most once per resource):
  //       CREATE UNIQUE INDEX no_duplicate_method_per_<resource>
  //         ON resource_auth_methods (<resource>Id, method)
  //         WHERE <resource>Id IS NOT NULL;
  //
  // Both shapes coexist peacefully on this table — they activate on different rows
  // based on which FK column is set.
  if (!(await knex.schema.hasTable(TableName.ResourceAuthMethod))) {
    await knex.schema.createTable(TableName.ResourceAuthMethod, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("CASCADE");
      t.string("method").notNullable();
      t.timestamps(true, true, true);
    });

    await knex.schema.raw(`
      CREATE UNIQUE INDEX one_method_per_gateway
      ON ${TableName.ResourceAuthMethod} ("gatewayId")
      WHERE "gatewayId" IS NOT NULL
    `);

    await createOnUpdateTrigger(knex, TableName.ResourceAuthMethod);
  }

  // 3. Backfill registry. Only gateways *without* identityId get rows here — those were
  //    created via main's token-flow (or are about to be configured). Identity-bound
  //    gateways are deliberately *not* given a registry row; they're the legacy state
  //    and detected at read time via gateways_v2.identityId IS NOT NULL. Switching
  //    method on a legacy gateway isn't supported — operators are pointed at
  //    "Create a new gateway" instead.
  await knex.raw(
    `INSERT INTO ?? ("gatewayId", method)
     SELECT id, 'token' FROM ?? WHERE "identityId" IS NULL
     ON CONFLICT DO NOTHING`,
    [TableName.ResourceAuthMethod, TableName.GatewayV2]
  );

  // 4. resource_aws_auths: AWS-method config. Keyed by authMethodId (FK to registry),
  // not by gatewayId — registry is the single source of truth for resource ownership.
  // Same table shape will serve any future resource type with no column changes.
  if (!(await knex.schema.hasTable(TableName.ResourceAwsAuth))) {
    await knex.schema.createTable(TableName.ResourceAwsAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("authMethodId").notNullable().unique();
      t.foreign("authMethodId").references("id").inTable(TableName.ResourceAuthMethod).onDelete("CASCADE");
      t.string("stsEndpoint").notNullable();
      t.string("allowedPrincipalArns", 4096).notNullable().defaultTo("");
      t.string("allowedAccountIds", 2048).notNullable().defaultTo("");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ResourceAwsAuth);
  }

  // 5. Reshape resource_token_auths from gatewayId-keyed to authMethodId-keyed.
  // After this block the table no longer carries gatewayId at all — the registry row
  // is the only place that knows which resource a token belongs to.
  if (await knex.schema.hasColumn(TableName.ResourceTokenAuth, "gatewayId")) {
    await knex.schema.alterTable(TableName.ResourceTokenAuth, (t) => {
      t.uuid("authMethodId").nullable();
    });

    // Backfill authMethodId from registry. Only token-method gateways have valid
    // mappings (a token row for a gateway now on identity method is an orphan).
    // usedAt filter: in the new model, row existence means "unused" — consumed
    // rows must not be carried over or they become replayable.
    await knex.raw(
      `UPDATE ?? AS t
       SET "authMethodId" = m.id
       FROM ?? AS m
       WHERE m."gatewayId" = t."gatewayId"
         AND m.method = 'token'
         AND t."usedAt" IS NULL`,
      [TableName.ResourceTokenAuth, TableName.ResourceAuthMethod]
    );

    // Scrub orphans — tokens whose gateway is now on a non-token method.
    await knex.raw(`DELETE FROM ?? WHERE "authMethodId" IS NULL`, [TableName.ResourceTokenAuth]);

    await knex.schema.alterTable(TableName.ResourceTokenAuth, (t) => {
      t.uuid("authMethodId").notNullable().alter();
      t.foreign("authMethodId").references("id").inTable(TableName.ResourceAuthMethod).onDelete("CASCADE");
      t.dropColumn("gatewayId");
      // usedAt is gone — token rows are deleted on consume rather than marked. Existence
      // of a row means "unused"; absence means "either never existed or already consumed."
      // Simpler model: no flag to filter on, no audit-of-used-tokens semantic to maintain.
      t.dropColumn("usedAt");
    });
  }

  // 6. Rename leftover indexes/constraints/triggers from the old table name. Pure
  // metadata cleanup — Postgres preserves the original names through renameTable, and
  // we want them to match the new table name for clarity.
  await knex.raw(
    `ALTER INDEX IF EXISTS gateway_enrollment_tokens_pkey
       RENAME TO resource_token_auths_pkey`
  );
  await knex.raw(
    `ALTER INDEX IF EXISTS gateway_enrollment_tokens_tokenhash_unique
       RENAME TO resource_token_auths_tokenhash_unique`
  );
  await knex.raw(
    `ALTER TABLE ?? RENAME CONSTRAINT gateway_enrollment_tokens_orgid_foreign
       TO resource_token_auths_orgid_foreign`,
    [TableName.ResourceTokenAuth]
  );
  // Trigger: drop the old name and recreate via the helper using the new table name.
  // (gateway_enrollment_tokens_gatewayid_foreign was dropped automatically when we
  // dropped the gatewayId column above.)
  await knex.raw(`DROP TRIGGER IF EXISTS "gateway_enrollment_tokens_updatedAt" ON ??`, [TableName.ResourceTokenAuth]);
  await createOnUpdateTrigger(knex, TableName.ResourceTokenAuth);
}

export async function down(knex: Knex): Promise<void> {
  // Reverse step 5: enrollment-tokens table back to gatewayId-keyed.
  if (await knex.schema.hasColumn(TableName.ResourceTokenAuth, "authMethodId")) {
    await knex.schema.alterTable(TableName.ResourceTokenAuth, (t) => {
      t.uuid("gatewayId").nullable();
      t.timestamp("usedAt").nullable();
    });
    await knex.raw(
      `UPDATE ?? AS t
       SET "gatewayId" = m."gatewayId"
       FROM ?? AS m
       WHERE m.id = t."authMethodId"`,
      [TableName.ResourceTokenAuth, TableName.ResourceAuthMethod]
    );
    await knex.schema.alterTable(TableName.ResourceTokenAuth, (t) => {
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("CASCADE");
      t.dropColumn("authMethodId");
    });
  }

  // Reverse step 4 + step 2: drop AWS-config and registry tables.
  await dropOnUpdateTrigger(knex, TableName.ResourceAwsAuth);
  await knex.schema.dropTableIfExists(TableName.ResourceAwsAuth);
  await dropOnUpdateTrigger(knex, TableName.ResourceAuthMethod);
  await knex.schema.dropTableIfExists(TableName.ResourceAuthMethod);

  // Reverse step 1: rename back. Triggers/indexes on the renamed table revert to the
  // old names too (done before the table rename so the SQL can resolve names).
  await knex.raw(`DROP TRIGGER IF EXISTS "resource_token_auths_updatedAt" ON ??`, [TableName.ResourceTokenAuth]);
  await knex.raw(
    `ALTER TABLE ?? RENAME CONSTRAINT resource_token_auths_orgid_foreign
       TO gateway_enrollment_tokens_orgid_foreign`,
    [TableName.ResourceTokenAuth]
  );
  await knex.raw(
    `ALTER INDEX IF EXISTS resource_token_auths_tokenhash_unique
       RENAME TO gateway_enrollment_tokens_tokenhash_unique`
  );
  await knex.raw(
    `ALTER INDEX IF EXISTS resource_token_auths_pkey
       RENAME TO gateway_enrollment_tokens_pkey`
  );

  const hasNewEnrollmentTokensTable = await knex.schema.hasTable(TableName.ResourceTokenAuth);
  const hasOldEnrollmentTokensTable = await knex.schema.hasTable(OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
  if (hasNewEnrollmentTokensTable && !hasOldEnrollmentTokensTable) {
    await knex.schema.renameTable(TableName.ResourceTokenAuth, OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
  }

  // Recreate the trigger using the old table name.
  await createOnUpdateTrigger(knex, OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
}
