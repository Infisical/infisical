import { v4 as uuidv4 } from "uuid";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import {
  agentVaultProjectAdminPermissions,
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission
} from "@app/ee/services/permission/default-roles";
import { TGetPredefinedRolesDTO } from "@app/services/project-role/project-role-types";

// Agent Vault's built-in roles are Admin and No Access: every other slug grants nothing there, and access past No Access
// comes from the project's custom roles.
const NARROWED_ROLE_PROJECT_TYPES = new Set<string>([ProjectType.AgentVault]);
const NARROWED_ROLE_SLUGS = new Set<string>([ProjectMembershipRole.Admin, ProjectMembershipRole.NoAccess]);

const AGENT_VAULT_ROLE_DESCRIPTIONS: Record<string, string> = {
  [ProjectMembershipRole.Admin]: "Full administrative access over this project",
  [ProjectMembershipRole.NoAccess]: "No access until given a role"
};

const SECRET_SCANNING_ROLE_DESCRIPTIONS: Record<string, string> = {
  [ProjectMembershipRole.Admin]: "Full administrative access over secret scanning",
  [ProjectMembershipRole.Member]: "Limited read/write role in secret scanning",
  [ProjectMembershipRole.Viewer]: "Only read role in secret scanning",
  [ProjectMembershipRole.NoAccess]: "No access to any resources in secret scanning"
};

// Agent Vault resolves its built-in roles to its own rules (`resolveAgentVaultProjectRoleRules`), so the roles list
// shows those rather than Secrets Management's.
const PERMISSIONS_BY_PROJECT_TYPE: Partial<Record<ProjectType, Record<string, typeof projectAdminPermissions>>> = {
  [ProjectType.AgentVault]: {
    [ProjectMembershipRole.Admin]: agentVaultProjectAdminPermissions,
    [ProjectMembershipRole.NoAccess]: []
  }
};

const ROLE_DESCRIPTIONS_BY_PROJECT_TYPE: Partial<Record<ProjectType, Record<string, string>>> = {
  [ProjectType.AgentVault]: AGENT_VAULT_ROLE_DESCRIPTIONS,
  [ProjectType.SecretScanning]: SECRET_SCANNING_ROLE_DESCRIPTIONS
};

export const getPredefinedRoles = ({ projectId, projectType, roleFilter }: TGetPredefinedRolesDTO) => {
  const isNarrowed = NARROWED_ROLE_PROJECT_TYPES.has(projectType);
  const roleDescriptions = ROLE_DESCRIPTIONS_BY_PROJECT_TYPE[projectType];
  const rolePermissions = PERMISSIONS_BY_PROJECT_TYPE[projectType];
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
  ]
    .filter(
      ({ slug, type }) =>
        (type ? type === projectType : true) &&
        (!roleFilter || roleFilter === slug) &&
        (!isNarrowed || NARROWED_ROLE_SLUGS.has(slug))
    )
    .map((role) => ({
      ...role,
      ...(roleDescriptions?.[role.slug] ? { description: roleDescriptions[role.slug] } : {}),
      ...(rolePermissions?.[role.slug] ? { permissions: rolePermissions[role.slug] } : {})
    }));
};
