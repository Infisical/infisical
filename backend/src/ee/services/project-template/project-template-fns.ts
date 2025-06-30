import {
  InfisicalProjectTemplate,
  TUnpackedPermission
} from "@app/ee/services/project-template/project-template-types";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { ProjectTemplateDefaultEnvironments } from "./project-template-constants";

export const getDefaultProjectTemplate = (orgId: string) => ({
  id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // random ID to appease zod
  name: InfisicalProjectTemplate.Default,
  createdAt: new Date(),
  updatedAt: new Date(),
  description: `Infisical's default project template`,
  environments: ProjectTemplateDefaultEnvironments,
  roles: getPredefinedRoles({ projectId: "project-template" }) as Array<{
    name: string;
    slug: string;
    permissions: TUnpackedPermission[];
  }>,
  orgId
});

export const isInfisicalProjectTemplate = (template: string) =>
  Object.values(InfisicalProjectTemplate).includes(template as InfisicalProjectTemplate);
