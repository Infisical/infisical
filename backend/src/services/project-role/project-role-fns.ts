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

// Agent Vault resolves every slug except admin to its member set, so Viewer and No Access would promise
// less access than they grant.
const NARROWED_ROLE_PROJECT_TYPES = new Set<string>([ProjectType.AgentVault]);
const NARROWED_ROLE_SLUGS = new Set<string>([ProjectMembershipRole.Admin, ProjectMembershipRole.Member]);

const AGENT_VAULT_ROLE_DESCRIPTIONS: Record<string, string> = {
  [ProjectMembershipRole.Admin]: "Full administrative access over Agent Vault",
  [ProjectMembershipRole.Member]: "Create sessions over the access bundles they're granted"
};

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
  ]
    .filter(
      ({ slug, type }) =>
        (type ? type === projectType : true) &&
        (!roleFilter || roleFilter === slug) &&
        (!isNarrowed || NARROWED_ROLE_SLUGS.has(slug))
    )
    .map((role) =>
      projectType === ProjectType.AgentVault && AGENT_VAULT_ROLE_DESCRIPTIONS[role.slug]
        ? { ...role, description: AGENT_VAULT_ROLE_DESCRIPTIONS[role.slug] }
        : role
    );
};
