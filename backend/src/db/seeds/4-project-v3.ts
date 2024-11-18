import { Knex } from "knex";

import { ProjectMembershipRole, ProjectVersion, TableName } from "../schemas";
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
      // eslint-disable-next-line
      // @ts-ignore
      id: seedData1.projectV3.id
    })
    .returning("*");

  const projectMembershipV3 = await knex(TableName.ProjectMembership)
    .insert({
      projectId: projectV2.id,
      userId: seedData1.id
    })
    .returning("*");
  await knex(TableName.ProjectUserMembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    projectMembershipId: projectMembershipV3[0].id
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
