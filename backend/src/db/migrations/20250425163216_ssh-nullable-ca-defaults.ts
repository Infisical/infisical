import { Knex } from "knex";

import { ProjectType, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDefaultUserCaCol = await knex.schema.hasColumn(TableName.ProjectSshConfig, "defaultUserSshCaId");
  const hasDefaultHostCaCol = await knex.schema.hasColumn(TableName.ProjectSshConfig, "defaultHostSshCaId");

  if (hasDefaultUserCaCol && hasDefaultHostCaCol) {
    await knex.schema.alterTable(TableName.ProjectSshConfig, (t) => {
      t.dropForeign(["defaultUserSshCaId"]);
      t.dropForeign(["defaultHostSshCaId"]);
    });
    await knex.schema.alterTable(TableName.ProjectSshConfig, (t) => {
      // allow nullable (does not wipe existing values)
      t.uuid("defaultUserSshCaId").nullable().alter();
      t.uuid("defaultHostSshCaId").nullable().alter();
      // re-add with SET NULL behavior (previously CASCADE)
      t.foreign("defaultUserSshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("SET NULL");
      t.foreign("defaultHostSshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("SET NULL");
    });
  }

  // (dangtony98): backfill by adding null defaults CAs for all existing Infisical SSH projects
  // that do not have an associated ProjectSshConfig record introduced in Infisical SSH V2.

  const allProjects = await knex(TableName.Project).where("type", ProjectType.SSH).select("id");

  const projectsWithConfig = await knex(TableName.ProjectSshConfig).select("projectId");
  const projectIdsWithConfig = new Set(projectsWithConfig.map((config) => config.projectId));

  const projectsNeedingConfig = allProjects.filter((project) => !projectIdsWithConfig.has(project.id));

  if (projectsNeedingConfig.length > 0) {
    const configsToInsert = projectsNeedingConfig.map((project) => ({
      projectId: project.id,
      defaultUserSshCaId: null,
      defaultHostSshCaId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await knex.batchInsert(TableName.ProjectSshConfig, configsToInsert);
  }
}

export async function down(): Promise<void> {}
