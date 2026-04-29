import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE = "gateway_enrollment_tokens";

export async function up(knex: Knex): Promise<void> {
  // Rename gateway_enrollment_tokens -> resource_enrollment_tokens (no column changes).
  const hasOldTable = await knex.schema.hasTable(OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
  const hasNewTable = await knex.schema.hasTable(TableName.ResourceEnrollmentTokens);
  if (hasOldTable && !hasNewTable) {
    await knex.schema.renameTable(OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE, TableName.ResourceEnrollmentTokens);
  }

  // resource_aws_auths: only the fields the existing gateway auth model actually enforces.
  // No JWT TTL columns (existing token-auth mints forever-JWTs), no trusted IPs (existing
  // GATEWAY_ACCESS_TOKEN auth middleware does not consult an allowlist). Revocation is
  // tokenVersion-based, same as token-auth enroll.
  if (!(await knex.schema.hasTable(TableName.ResourceAwsAuth))) {
    await knex.schema.createTable(TableName.ResourceAwsAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("gatewayId").notNullable().unique();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("CASCADE");
      t.string("stsEndpoint").notNullable().defaultTo("https://sts.amazonaws.com/");
      t.string("allowedPrincipalArns", 4096).notNullable().defaultTo("");
      t.string("allowedAccountIds", 2048).notNullable().defaultTo("");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ResourceAwsAuth);
  }

  // resource_token_auths: presence row indicating Token Auth is enabled for this gateway.
  // Enrollment token TTL is hardcoded at 1 hour (matches existing behavior); issued
  // GATEWAY_ACCESS_TOKEN JWTs do not expire.
  if (!(await knex.schema.hasTable(TableName.ResourceTokenAuth))) {
    await knex.schema.createTable(TableName.ResourceTokenAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("gatewayId").notNullable().unique();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ResourceTokenAuth);
  }

  // No backfill: existing daemons keep authenticating with their current JWTs (we don't bump
  // tokenVersion either). To generate a fresh enrollment token, operators must explicitly
  // attach Token Auth via the new UI — at which point a resource_token_auths row is created
  // (and any prior identity binding on the gateway is unlinked, see attachTokenAuth).
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ResourceTokenAuth);
  await knex.schema.dropTableIfExists(TableName.ResourceTokenAuth);

  await dropOnUpdateTrigger(knex, TableName.ResourceAwsAuth);
  await knex.schema.dropTableIfExists(TableName.ResourceAwsAuth);

  const hasNewTable = await knex.schema.hasTable(TableName.ResourceEnrollmentTokens);
  const hasOldTable = await knex.schema.hasTable(OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
  if (hasNewTable && !hasOldTable) {
    await knex.schema.renameTable(TableName.ResourceEnrollmentTokens, OLD_GATEWAY_ENROLLMENT_TOKENS_TABLE);
  }
}
