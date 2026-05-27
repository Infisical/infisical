import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import {
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import {
  InfisicalProjectTemplate,
  TUnpackedPermission
} from "@app/ee/services/project-template/project-template-types";

import { ProjectTemplateDefaultEnvironments } from "./project-template-constants";

const getDefaultTemplateRoles = (type: ProjectType) => {
  const roles = [
    {
      name: "Admin",
      slug: ProjectMembershipRole.Admin,
      permissions: projectAdminPermissions as TUnpackedPermission[]
    },
    {
      name: "Member",
      slug: ProjectMembershipRole.Member,
      permissions: projectMemberPermissions as TUnpackedPermission[]
    },
    {
      name: "Viewer",
      slug: ProjectMembershipRole.Viewer,
      permissions: projectViewerPermission as TUnpackedPermission[]
    },
    {
      name: "No Access",
      slug: ProjectMembershipRole.NoAccess,
      permissions: projectNoAccessPermissions as TUnpackedPermission[]
    }
  ];

  if (type === ProjectType.SSH) {
    roles.push({
      name: "SSH Host Bootstrapper",
      slug: ProjectMembershipRole.SshHostBootstrapper,
      permissions: sshHostBootstrapPermissions as TUnpackedPermission[]
    });
  }

  if (type === ProjectType.KMS) {
    roles.push({
      name: "Cryptographic Operator",
      slug: ProjectMembershipRole.KmsCryptographicOperator,
      permissions: cryptographicOperatorPermissions as TUnpackedPermission[]
    });
  }

  return roles;
};

export const getDefaultProjectTemplate = (orgId: string, type: ProjectType) => ({
  id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // random ID to appease zod
  type,
  name: InfisicalProjectTemplate.Default,
  createdAt: new Date(),
  updatedAt: new Date(),
  description: `Infisical's ${type} default project template`,
  environments: type === ProjectType.SecretManager ? ProjectTemplateDefaultEnvironments : null,
  roles: getDefaultTemplateRoles(type),
  users: null,
  groups: null,
  identities: null,
  projectManagedIdentities: null,
  orgId
});

export const isInfisicalProjectTemplate = (template: string) =>
  Object.values(InfisicalProjectTemplate).includes(template as InfisicalProjectTemplate);
