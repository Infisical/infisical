import { Knex } from "knex";

import { TableName } from "../schemas";

const SKILL = TableName.AgentVaultSkill;

const PROJECT_NAME_UNIQUE = "agent_vault_skills_project_name_unique";
const SESSION_POSITION_UNIQUE = "agent_vault_skills_session_position_unique";
const SESSION_NAME_UNIQUE = "agent_vault_skills_session_name_unique";
const INLINE_WITH_FILES_INDEX = "agent_vault_skills_inline_with_files";
const INLINE_POSITION_CHECK = "agent_vault_skills_inline_position_check";

// The skills a session names, beside or instead of an access bundle, and the ones sent with it. Each step is guarded
// so a database that already has it keeps it as it is.
export async function up(knex: Knex): Promise<void> {
  // Like the services it names, the list is a ceiling fixed at mint: an agent gets only the skills the session's owner
  // may still use.
  if (!(await knex.schema.hasTable(TableName.AgentVaultSessionSkill))) {
    await knex.schema.createTable(TableName.AgentVaultSessionSkill, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");

      t.uuid("skillId").notNullable();
      t.foreign("skillId").references("id").inTable(SKILL).onDelete("CASCADE");
      t.index("skillId");

      t.integer("position").notNullable();

      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.unique(["sessionId", "skillId"]);
    });
  }

  // A skill sent with a session is a row of agent_vault_skills with sessionId set, and its files are its one version,
  // the way an inline service is a row of agent_vault_services. The row stays once the session ends, so its history
  // still shows what the agent was given, but its files don't.
  if (!(await knex.schema.hasColumn(SKILL, "sessionId"))) {
    await knex.schema.alterTable(SKILL, (t) => {
      // The projectId foreign key's cascade needs an index over every row, which the partial ones below aren't.
      t.index("projectId");
      t.dropUnique(["projectId", "name"]);

      t.uuid("sessionId");
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");
      // Shared with the skills the session names, so reads return both kinds in the order they were sent.
      t.integer("position");
      // When an inline skill's files were deleted because its session ended.
      t.timestamp("filesDeletedAt", { useTz: true });
    });

    // NULL once an inline skill's session ends, while its hash and size stay for history.
    await knex.schema.alterTable(TableName.AgentVaultSkillVersion, (t) => {
      t.setNullable("encryptedFiles");
    });

    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("projectId", name) WHERE "sessionId" IS NULL`, [
      PROJECT_NAME_UNIQUE,
      SKILL
    ]);
    // sessionId leads, so the index also serves the session foreign key's cascade.
    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("sessionId", position) WHERE "sessionId" IS NOT NULL`, [
      SESSION_POSITION_UNIQUE,
      SKILL
    ]);
    // Each skill installs as a folder of its name, so one session can't have two of a name.
    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("sessionId", name) WHERE "sessionId" IS NOT NULL`, [
      SESSION_NAME_UNIQUE,
      SKILL
    ]);
    // The hourly cleanup looks only at inline skills that may still hold files, never at ended sessions' history.
    await knex.raw(`CREATE INDEX ?? ON ?? ("sessionId") WHERE "sessionId" IS NOT NULL AND "filesDeletedAt" IS NULL`, [
      INLINE_WITH_FILES_INDEX,
      SKILL
    ]);
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (("sessionId" IS NULL) = (position IS NULL) AND ("sessionId" IS NOT NULL OR "filesDeletedAt" IS NULL))`,
      [SKILL, INLINE_POSITION_CHECK]
    );
  }
}

// Inline skills are deleted, their versions with them through the foreign key.
export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(SKILL, "sessionId")) {
    await knex(SKILL).whereNotNull("sessionId").delete();

    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [SKILL, INLINE_POSITION_CHECK]);
    await knex.raw(`DROP INDEX IF EXISTS ??, ??, ??, ??`, [
      PROJECT_NAME_UNIQUE,
      SESSION_POSITION_UNIQUE,
      SESSION_NAME_UNIQUE,
      INLINE_WITH_FILES_INDEX
    ]);
    await knex.schema.alterTable(SKILL, (t) => {
      t.dropForeign(["sessionId"]);
      t.dropColumn("sessionId");
      t.dropColumn("position");
      t.dropColumn("filesDeletedAt");
      t.unique(["projectId", "name"]);
      t.dropIndex(["projectId"]);
    });

    await knex.schema.alterTable(TableName.AgentVaultSkillVersion, (t) => {
      t.dropNullable("encryptedFiles");
    });
  }

  await knex.schema.dropTableIfExists(TableName.AgentVaultSessionSkill);
}
