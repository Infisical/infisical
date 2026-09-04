import { v4 as uuidv4 } from "uuid";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import {
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission
} from "@app/ee/services/permission/default-roles";
import { TGetPredefinedRolesDTO } from "@app/services/project-role/project-role-types";

// Agent Vault resolves every slug except admin to its member set (see buildProjectPermissionRules), so
// offering Viewer or No Access would promise less access than the role grants.
//
// PAM does the same and has the same misleading pickers, but it is left as it is: this list feeds the
// roles API, the org-admin invite flow's project list, and project templates, and narrowing all three
// for PAM is its own change to make deliberately rather than a side effect of shipping Agent Vault.
const NARROWED_ROLE_PROJECT_TYPES = new Set<string>([ProjectType.AgentVault]);
const NARROWED_ROLE_SLUGS = new Set<string>([ProjectMembershipRole.Admin, ProjectMembershipRole.Member]);

export const getPredefinedRoles = ({ projectId, projectType, roleFilter }: TGetPredefinedRolesDTO) => {
  const isNarrowed = NARROWED_ROLE_PROJECT_TYPES.has(projectType);
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
      name: "Member",
      slug: ProjectMembershipRole.Member,
      permissions: projectMemberPermissions,
      description: "Limited read/write role in a project",
      createdAt: new Date(),
      updatedAt: new Date()
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
  ].filter(
    ({ slug, type }) =>
      (type ? type === projectType : true) &&
      (!roleFilter || roleFilter === slug) &&
      (!isNarrowed || NARROWED_ROLE_SLUGS.has(slug))
  );
};
