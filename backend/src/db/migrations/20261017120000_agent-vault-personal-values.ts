import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const PROJECT_KEY_UNIQUE = "agent_vault_variables_projectid_key_unique";
const GLOBAL_KEY_UNIQUE = "agent_vault_variables_global_key_unique";
const SERVICE_REFERENCE_VARIABLE_FK = "agent_vault_service_variable_references_variableid_foreign";
const USER_KEY_UNIQUE = "agent_vault_variables_user_key_unique";
const IDENTITY_KEY_UNIQUE = "agent_vault_variables_identity_key_unique";

// A NULL never equals a NULL, so a unique index over the optional target columns would let one field be saved twice.
const NO_TARGET = "'00000000-0000-0000-0000-000000000000'::uuid";

export async function up(knex: Knex): Promise<void> {
  // A variable with an owner is that user's or identity's own; one without is global across Agent Vault.
  if (!(await knex.schema.hasColumn(TableName.AgentVaultVariable, "userId"))) {
    await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.dropUnique(["projectId", "key"], PROJECT_KEY_UNIQUE);
      // The projectId foreign key's cascade needs an index over every row, which the partial ones below aren't.
      t.index("projectId");
    });
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT "agent_vault_variables_one_owner" CHECK (num_nonnulls("userId", "identityId") <= 1)`,
      [TableName.AgentVaultVariable]
    );
    await knex.raw(
      `CREATE UNIQUE INDEX ?? ON ?? ("projectId", "key") WHERE "userId" IS NULL AND "identityId" IS NULL`,
      [GLOBAL_KEY_UNIQUE, TableName.AgentVaultVariable]
    );
    // The owner column leads, so each index also serves its foreign key's cascade.
    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("userId", "projectId", "key") WHERE "userId" IS NOT NULL`, [
      USER_KEY_UNIQUE,
      TableName.AgentVaultVariable
    ]);
    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("identityId", "projectId", "key") WHERE "identityId" IS NOT NULL`, [
      IDENTITY_KEY_UNIQUE,
      TableName.AgentVaultVariable
    ]);
  }

  // NULL when the admin sets every field. An empty array is never stored, so NULL is the only "none".
  if (!(await knex.schema.hasColumn(TableName.AgentVaultService, "memberProvidedFields"))) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      t.specificType("memberProvidedFields", "text[]");
    });
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT "agent_vault_services_member_provided_fields_check" CHECK (cardinality("memberProvidedFields") > 0 AND "memberProvidedFields" <@ ARRAY['credential-value', 'credential-username']::text[])`,
      [TableName.AgentVaultService]
    );
  }

  // One row per field a member has set, sealed like every other value. The target columns mirror the variable
  // references table so a custom header or substitution can be member-provided later without reshaping this.
  if (!(await knex.schema.hasTable(TableName.AgentVaultPersonalValue))) {
    await knex.schema.createTable(TableName.AgentVaultPersonalValue, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.AgentVaultService).onDelete("CASCADE");
      t.index("serviceId");

      t.string("field", 32).notNullable();

      t.uuid("customHeaderId");
      t.foreign("customHeaderId").references("id").inTable(TableName.AgentVaultServiceCustomHeader).onDelete("CASCADE");
      t.index("customHeaderId");

      t.uuid("substitutionId");
      t.foreign("substitutionId").references("id").inTable(TableName.AgentVaultServiceSubstitution).onDelete("CASCADE");
      t.index("substitutionId");

      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.binary("encryptedValue").notNullable();

      t.timestamps(true, true, true);
    });

    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT "agent_vault_personal_values_one_owner" CHECK (num_nonnulls("userId", "identityId") = 1)`,
      [TableName.AgentVaultPersonalValue]
    );
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT "agent_vault_personal_values_field_check" CHECK (
        ("field" = 'custom-header' AND "customHeaderId" IS NOT NULL AND "substitutionId" IS NULL)
        OR ("field" = 'substitution' AND "substitutionId" IS NOT NULL AND "customHeaderId" IS NULL)
        OR ("field" IN ('credential-value', 'credential-username') AND "customHeaderId" IS NULL AND "substitutionId" IS NULL)
      )`,
      [TableName.AgentVaultPersonalValue]
    );
    await knex.raw(
      `CREATE UNIQUE INDEX "agent_vault_personal_values_user_unique" ON ?? ("userId", "serviceId", "field", COALESCE("customHeaderId", ${NO_TARGET}), COALESCE("substitutionId", ${NO_TARGET})) WHERE "userId" IS NOT NULL`,
      [TableName.AgentVaultPersonalValue]
    );
    await knex.raw(
      `CREATE UNIQUE INDEX "agent_vault_personal_values_identity_unique" ON ?? ("identityId", "serviceId", "field", COALESCE("customHeaderId", ${NO_TARGET}), COALESCE("substitutionId", ${NO_TARGET})) WHERE "identityId" IS NOT NULL`,
      [TableName.AgentVaultPersonalValue]
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultPersonalValue);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultPersonalValueReference))) {
    await knex.schema.createTable(TableName.AgentVaultPersonalValueReference, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("personalValueId").notNullable();
      t.foreign("personalValueId", "agent_vault_personal_value_refs_value_foreign")
        .references("id")
        .inTable(TableName.AgentVaultPersonalValue)
        .onDelete("CASCADE");
      t.index("personalValueId");

      // Deferred for the same reason as agent_vault_service_variable_references.variableId: deleting a user cascades
      // to their variables and their personal values in one statement, and an immediate check can run before the
      // personal value cascade has removed these rows.
      t.uuid("variableId").notNullable();
      t.foreign("variableId", "agent_vault_personal_value_refs_variable_foreign")
        .references("id")
        .inTable(TableName.AgentVaultVariable)
        .deferrable("deferred");
      t.index("variableId");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultPersonalValueReference);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentVaultPersonalValueReference);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultPersonalValueReference);

  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultPersonalValue]);
  await knex.schema.dropTableIfExists(TableName.AgentVaultPersonalValue);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultPersonalValue);

  // The analytics views select these columns, and Postgres won't drop a column a view uses.
  if (await knex.schema.hasColumn(TableName.AgentVaultService, "memberProvidedFields")) {
    await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultService]);
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      t.dropColumn("memberProvidedFields");
    });
  }

  if (await knex.schema.hasColumn(TableName.AgentVaultVariable, "userId")) {
    await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultVariable]);
    // Variables of one owner can't move into the global namespace, where their keys may clash.
    await knex(TableName.AgentVaultVariable)
      .where((owned) => {
        void owned.whereNotNull("userId").orWhereNotNull("identityId");
      })
      .delete();
    // The delete queues the deferred reference check, and Postgres won't alter a table with one pending. Run it now,
    // then put the constraint back to deferred for the rest of the batch.
    await knex.raw(`SET CONSTRAINTS ?? IMMEDIATE`, [SERVICE_REFERENCE_VARIABLE_FK]);
    await knex.raw(`SET CONSTRAINTS ?? DEFERRED`, [SERVICE_REFERENCE_VARIABLE_FK]);
    await knex.raw(`DROP INDEX IF EXISTS ??`, [GLOBAL_KEY_UNIQUE]);
    await knex.raw(`DROP INDEX IF EXISTS ??`, [USER_KEY_UNIQUE]);
    await knex.raw(`DROP INDEX IF EXISTS ??`, [IDENTITY_KEY_UNIQUE]);
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS "agent_vault_variables_one_owner"`, [
      TableName.AgentVaultVariable
    ]);
    await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
      t.dropIndex("projectId");
      t.dropForeign(["userId"]);
      t.dropColumn("userId");
      t.dropForeign(["identityId"]);
      t.dropColumn("identityId");
      t.unique(["projectId", "key"], { indexName: PROJECT_KEY_UNIQUE });
    });
  }
}
