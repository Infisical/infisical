import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

export async function seed(knex: Knex): Promise<void> {
  const [projectV2] = await knex(TableName.Project)
    .insert({
      name: seedData1.projectV3.name,
      orgId: seedData1.organization.id,
      slug: seedData1.projectV3.slug,
      version: ProjectVersion.V3,
      type: ProjectType.SecretManager,
      // eslint-disable-next-line
      // @ts-ignore
      id: seedData1.projectV3.id
    })
    .returning("*");

  const projectMembershipV3 = await knex(TableName.Membership)
    .insert({
      scopeProjectId: projectV2.id,
      actorUserId: seedData1.id,
      scope: AccessScope.Project,
      scopeOrgId: seedData1.organization.id
    })
    .returning("*");
  await knex(TableName.MembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    membershipId: projectMembershipV3[0].id
  });

  // create default environments and default folders
  const projectV3Envs = await knex(TableName.Environment)
    .insert(
      DEFAULT_PROJECT_ENVS.map(({ name, slug }, index) => ({
        name,
        slug,
        projectId: seedData1.projectV3.id,
        position: index + 1
      }))
    )
    .returning("*");
  await knex(TableName.SecretFolder).insert(
    projectV3Envs.map(({ id }) => ({ name: "root", envId: id, parentId: null }))
  );
}
