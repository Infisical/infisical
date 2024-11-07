import { ProjectTemplateDefaultEnvironments } from "@app/ee/services/project-template/project-template-constants";
import {
  InfisicalProjectTemplate,
  TUnpackedPermission
} from "@app/ee/services/project-template/project-template-types";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

export const getDefaultProjectTemplate = (orgId: string) => ({
  id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // random ID to appease zod
  name: InfisicalProjectTemplate.Default,
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

export const isInfisicalProjectTemplate = (template: string) =>
  Object.values(InfisicalProjectTemplate).includes(template as InfisicalProjectTemplate);
