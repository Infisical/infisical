import { Knex } from "knex";

import { ProjectMembershipRole, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesProjectRoleFieldExist = await knex.schema.hasColumn(TableName.ProjectMembership, "role");
  const doesProjectRoleIdFieldExist = await knex.schema.hasColumn(TableName.ProjectMembership, "roleId");
  await knex.schema.alterTable(TableName.ProjectMembership, (t) => {
    if (doesProjectRoleFieldExist) t.dropColumn("roleId");
    if (doesProjectRoleIdFieldExist) t.dropColumn("role");
  });

  const doesIdentityProjectRoleFieldExist = await knex.schema.hasColumn(TableName.IdentityProjectMembership, "role");
  const doesIdentityProjectRoleIdFieldExist = await knex.schema.hasColumn(
    TableName.IdentityProjectMembership,
    "roleId"
  );
  await knex.schema.alterTable(TableName.IdentityProjectMembership, (t) => {
    if (doesIdentityProjectRoleFieldExist) t.dropColumn("roleId");
    if (doesIdentityProjectRoleIdFieldExist) t.dropColumn("role");
  });
}

export async function down(knex: Knex): Promise<void> {
  const doesProjectRoleFieldExist = await knex.schema.hasColumn(TableName.ProjectMembership, "role");
  const doesProjectRoleIdFieldExist = await knex.schema.hasColumn(TableName.ProjectMembership, "roleId");
  await knex.schema.alterTable(TableName.ProjectMembership, (t) => {
    if (!doesProjectRoleFieldExist) t.string("role").defaultTo(ProjectMembershipRole.Member);
    if (!doesProjectRoleIdFieldExist) {
      t.uuid("roleId");
      t.foreign("roleId").references("id").inTable(TableName.ProjectRoles);
    }
  });

  const doesIdentityProjectRoleFieldExist = await knex.schema.hasColumn(TableName.IdentityProjectMembership, "role");
  const doesIdentityProjectRoleIdFieldExist = await knex.schema.hasColumn(
    TableName.IdentityProjectMembership,
    "roleId"
  );
  await knex.schema.alterTable(TableName.IdentityProjectMembership, (t) => {
    if (!doesIdentityProjectRoleFieldExist) t.string("role").defaultTo(ProjectMembershipRole.Member);
    if (!doesIdentityProjectRoleIdFieldExist) {
      t.uuid("roleId");
      t.foreign("roleId").references("id").inTable(TableName.ProjectRoles);
    }
  });
}
