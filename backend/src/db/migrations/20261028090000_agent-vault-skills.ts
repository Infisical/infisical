import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultSkill))) {
    await knex.schema.createTable(TableName.AgentVaultSkill, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("name", 64).notNullable();
      t.string("description", 1024).notNullable();

      t.timestamps(true, true, true);

      // Also the index the projectId foreign key needs, as its leftmost column.
      t.unique(["projectId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultSkill);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultSkillVersion))) {
    await knex.schema.createTable(TableName.AgentVaultSkillVersion, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("skillId").notNullable();
      t.foreign("skillId").references("id").inTable(TableName.AgentVaultSkill).onDelete("CASCADE");

      t.integer("version").notNullable();
      t.binary("encryptedFiles").notNullable();
      t.string("sha256", 64).notNullable();
      t.integer("sizeBytes").notNullable();
      t.integer("fileCount").notNullable();

      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Also the index the skillId foreign key needs, as its leftmost column.
      t.unique(["skillId", "version"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultAccessBundleSkill))) {
    await knex.schema.createTable(TableName.AgentVaultAccessBundleSkill, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("accessBundleId").notNullable();
      t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");

      t.uuid("skillId").notNullable();
      t.foreign("skillId").references("id").inTable(TableName.AgentVaultSkill).onDelete("CASCADE");
      t.index("skillId");

      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Also the index the accessBundleId foreign key needs, as its leftmost column.
      t.unique(["accessBundleId", "skillId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentVaultAccessBundleSkill);
  await knex.schema.dropTableIfExists(TableName.AgentVaultSkillVersion);

  await knex.schema.dropTableIfExists(TableName.AgentVaultSkill);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultSkill);
}
