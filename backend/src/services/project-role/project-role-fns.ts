import { v4 as uuidv4 } from "uuid";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas/models";
import {
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import { TGetPredefinedRolesDTO } from "@app/services/project-role/project-role-types";

export const getPredefinedRoles = ({ projectId, projectType, roleFilter }: TGetPredefinedRolesDTO) => {
  return [
    {
      id: uuidv4(),
      projectId,
      name: "Admin",
      slug: ProjectMembershipRole.Admin,
      permissions: projectAdminPermissions,
      description: "Full administrative access over a project",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      projectId,
      name: "Developer",
      slug: ProjectMembershipRole.Member,
      permissions: projectMemberPermissions,
      description: "Limited read/write role in a project",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      projectId,
      name: "SSH Host Bootstrapper",
      slug: ProjectMembershipRole.SshHostBootstrapper,
      permissions: sshHostBootstrapPermissions,
      description: "Create and issue SSH Hosts in a project",
      createdAt: new Date(),
      updatedAt: new Date(),
      type: ProjectType.SSH
    },
    {
      id: uuidv4(),
      projectId,
      name: "Cryptographic Operator",
      slug: ProjectMembershipRole.KmsCryptographicOperator,
      permissions: cryptographicOperatorPermissions,
      description: "Perform cryptographic operations, such as encryption and signing, in a project",
      createdAt: new Date(),
      updatedAt: new Date(),
      type: ProjectType.KMS
    },
    {
      id: uuidv4(),
      projectId,
      name: "Viewer",
      slug: ProjectMembershipRole.Viewer,
      permissions: projectViewerPermission,
      description: "Only read role in a project",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      projectId,
      name: "No Access",
      slug: ProjectMembershipRole.NoAccess,
      permissions: projectNoAccessPermissions,
      description: "No access to any resources in the project",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ].filter(({ slug, type }) => (type ? type === projectType : true) && (!roleFilter || roleFilter === slug));
};
