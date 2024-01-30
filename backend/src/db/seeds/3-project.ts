import { Knex } from "knex";

import { OrgMembershipRole, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Project).del();
  await knex(TableName.Environment).del();
  await knex(TableName.SecretFolder).del();

  const [project] = await knex(TableName.Project)
    .insert({
      name: seedData1.project.name,
      orgId: seedData1.organization.id,
      slug: "first-project",
      // @ts-expect-error exluded type id needs to be inserted here to keep it testable
      id: seedData1.project.id
    })
    .returning("*");

  // await knex(TableName.ProjectKeys).insert({
  //   projectId: project.id,
  //   senderId: seedData1.id
  // });

  await knex(TableName.ProjectMembership).insert({
    projectId: project.id,
    role: OrgMembershipRole.Admin,
    userId: seedData1.id
  });
  const envs = await knex(TableName.Environment)
    .insert(
      DEFAULT_PROJECT_ENVS.map(({ name, slug }, index) => ({
        name,
        slug,
        projectId: project.id,
        position: index + 1
      }))
    )
    .returning("*");
  await knex(TableName.SecretFolder).insert(envs.map(({ id }) => ({ name: "root", envId: id, parentId: null })));
}
