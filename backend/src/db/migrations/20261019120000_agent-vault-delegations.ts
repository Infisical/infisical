import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const SESSION_ACTING_IDENTITY_CHECK = "agent_vault_sessions_acting_identity_check";

export async function up(knex: Knex): Promise<void> {
  // A session a machine identity starts on a user's behalf belongs to the user and names the identity here. The
  // name is snapshotted like actorName, and it is what still marks the session as on-behalf-of once deleting the
  // identity sets the id to NULL.
  if (!(await knex.schema.hasColumn(TableName.AgentVaultSession, "actingIdentityId"))) {
    await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
      t.uuid("actingIdentityId");
      t.foreign("actingIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      t.string("actingIdentityName", 255);
    });
    await knex.raw(
      `CREATE INDEX agent_vault_session_by_acting_identity ON ?? ("actingIdentityId") WHERE "actingIdentityId" IS NOT NULL`,
      [TableName.AgentVaultSession]
    );
    // An on-behalf-of session is always a user's, and an id is never stored without the name. actorType can be NULL on
    // rows the previous release writes during a rolling deploy.
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (("actingIdentityName" IS NULL OR ("identityId" IS NULL AND ("actorType" IS NULL OR "actorType" = 'user'))) AND ("actingIdentityId" IS NULL OR "actingIdentityName" IS NOT NULL))`,
      [TableName.AgentVaultSession, SESSION_ACTING_IDENTITY_CHECK]
    );
  }

  // Which users a machine identity may start sessions on behalf of: everyone in Agent Vault, or the users and
  // groups listed in agent_vault_delegation_subjects. One row per identity. A delegation and each of its subjects
  // hang off an Agent Vault membership, so every way of leaving Agent Vault (Agent Vault's own removal, the generic
  // project membership routes, leaving the organization, deleting the actor) takes them with it.
  if (!(await knex.schema.hasTable(TableName.AgentVaultDelegation))) {
    await knex.schema.createTable(TableName.AgentVaultDelegation, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      // The identity's own Agent Vault membership. Unique, so the index also serves the cascade.
      t.uuid("membershipId").notNullable().unique();
      t.foreign("membershipId").references("id").inTable(TableName.Membership).onDelete("CASCADE");

      t.string("scope", 32).notNullable();

      t.timestamps(true, true, true);

      // identityId leads, so the index also serves the identity foreign key's cascade.
      t.unique(["identityId", "projectId"]);
    });

    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT "agent_vault_delegations_scope_check" CHECK ("scope" IN ('all-members', 'selected'))`,
      [TableName.AgentVaultDelegation]
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultDelegation);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultDelegationSubject))) {
    await knex.schema.createTable(TableName.AgentVaultDelegationSubject, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("delegationId").notNullable();
      t.foreign("delegationId").references("id").inTable(TableName.AgentVaultDelegation).onDelete("CASCADE");
      t.index("delegationId");

      // The Agent Vault membership of the user or group the delegation names.
      t.uuid("membershipId").notNullable();
      t.foreign("membershipId").references("id").inTable(TableName.Membership).onDelete("CASCADE");

      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // membershipId leads, so the index also serves the membership foreign key's cascade.
      t.unique(["membershipId", "delegationId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultDelegationSubject]);
  await knex.schema.dropTableIfExists(TableName.AgentVaultDelegationSubject);

  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultDelegation]);
  await knex.schema.dropTableIfExists(TableName.AgentVaultDelegation);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultDelegation);

  if (await knex.schema.hasColumn(TableName.AgentVaultSession, "actingIdentityId")) {
    // Without the columns an on-behalf-of session reads as the user's own and would resolve with no delegation
    // behind it, so every one still live is revoked first.
    await knex(TableName.AgentVaultSession)
      .whereNotNull("actingIdentityName")
      .whereNull("revokedAt")
      .update({ revokedAt: new Date() });

    // The analytics view selects these columns, and Postgres won't drop a column a view uses.
    await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultSession]);
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
      TableName.AgentVaultSession,
      SESSION_ACTING_IDENTITY_CHECK
    ]);
    await knex.raw(`DROP INDEX IF EXISTS agent_vault_session_by_acting_identity`);
    await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
      t.dropForeign(["actingIdentityId"]);
      t.dropColumn("actingIdentityId");
      t.dropColumn("actingIdentityName");
    });
  }
}
