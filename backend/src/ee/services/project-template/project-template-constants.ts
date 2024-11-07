import { TUnpackedPermission } from "@app/ee/services/project-template/project-template-types";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

export const ProjectTemplateDefaultEnvironments = [
  { name: "Development", slug: "dev", position: 1 },
  { name: "Staging", slug: "staging", position: 2 },
  { name: "Production", slug: "prod", position: 3 }
];

export const DefaultProjectTemplateIdentifier = "default";

export const getDefaultProjectTemplate = (orgId: string) => ({
  id: "b11b49a9-09a9-4443-916a-4246f9ff2c69",
  name: DefaultProjectTemplateIdentifier,
  createdAt: new Date(),
  updatedAt: new Date(),
  description: "Infisical's default project template",
  environments: ProjectTemplateDefaultEnvironments,
  roles: [...getPredefinedRoles("project-template")].map(({ name, slug, permissions }) => ({
    name,
    slug,
    permissions: permissions as TUnpackedPermission[]
  })),
  orgId
});
