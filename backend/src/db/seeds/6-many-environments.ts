import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

const ENVIRONMENTS = [
  { name: "Development", slug: "dev" },
  { name: "QA", slug: "qa" },
  { name: "Staging", slug: "staging" },
  { name: "UAT", slug: "uat" },
  { name: "Performance", slug: "perf" },
  { name: "Sandbox", slug: "sandbox" },
  { name: "Demo", slug: "demo" },
  { name: "Preview", slug: "preview" },
  { name: "Canary", slug: "canary" },
  { name: "Production US", slug: "prod-us" },
  { name: "Production EU", slug: "prod-eu" },
  { name: "Production APAC", slug: "prod-apac" }
];

export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "test") return;

  const [project] = await knex(TableName.Project)
    .insert({
      name: "many environments",
      orgId: seedData1.organization.id,
      slug: "many-environments",
      version: ProjectVersion.V3,
      type: ProjectType.SecretManager
    })
    .returning("*");

  const [membership] = await knex(TableName.Membership)
    .insert({
      scopeProjectId: project.id,
      actorUserId: seedData1.id,
      scope: AccessScope.Project,
      scopeOrgId: seedData1.organization.id
    })
    .returning("*");
  await knex(TableName.MembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    membershipId: membership.id
  });

  const environments = await knex(TableName.Environment)
    .insert(
      ENVIRONMENTS.map(({ name, slug }, index) => ({
        name,
        slug,
        projectId: project.id,
        position: index + 1
      }))
    )
    .returning("*");
  const roots = await knex(TableName.SecretFolder)
    .insert(environments.map(({ id }) => ({ name: "root", envId: id, parentId: null })))
    .returning("*");
  const envId = (slug: string) => environments.find((environment) => environment.slug === slug)!.id;
  const rootOf = (slug: string) => roots.find((folder) => folder.envId === envId(slug))!.id;

  await knex(TableName.SecretFolder).insert([
    { name: "shared", envId: envId("prod-us"), parentId: rootOf("prod-us") },
    { name: "flags", envId: envId("staging"), parentId: rootOf("staging") }
  ]);

  const importInto = (slugs: string[], source: string, importPath: string, position: number) =>
    slugs.map((slug) => ({ folderId: rootOf(slug), importEnv: envId(source), importPath, position }));
  await knex(TableName.SecretImport).insert([
    ...importInto(
      ENVIRONMENTS.map(({ slug }) => slug).filter((slug) => slug !== "prod-us"),
      "prod-us",
      "/shared",
      1
    ),
    ...importInto(
      ["dev", "qa", "uat", "perf", "sandbox", "demo", "preview", "canary", "prod-eu"],
      "staging",
      "/flags",
      2
    )
  ]);
}
