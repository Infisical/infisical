import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import {
  cryptographicOperatorPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const packPerms = (rules: unknown) => JSON.stringify((packRules as (r: any) => unknown[])(rules));

const packedProjectMember = packPerms(projectMemberPermissions);
const packedProjectViewer = packPerms(projectViewerPermission);
const packedProjectNoAccess = packPerms(projectNoAccessPermissions);
const packedSshHostBootstrap = packPerms(sshHostBootstrapPermissions);
const packedCryptoOperator = packPerms(cryptographicOperatorPermissions);

// Built-in project roles (excluding Admin, which has no DB row and is resolved in-code)
export const getProjectBuiltInRoles = (projectId: string, projectType: ProjectType) => [
  {
    projectId,
    name: "Member",
    slug: ProjectMembershipRole.Member,
    description: "Limited read/write role in a project",
    permissions: packedProjectMember,
    isBuiltIn: true
  },
  ...(projectType === ProjectType.CertificateManager
    ? []
    : [
        {
          projectId,
          name: "Viewer",
          slug: ProjectMembershipRole.Viewer,
          description: "Only read role in a project",
          permissions: packedProjectViewer,
          isBuiltIn: true
        },
        {
          projectId,
          name: "No Access",
          slug: ProjectMembershipRole.NoAccess,
          description: "No access to any resources in the project",
          permissions: packedProjectNoAccess,
          isBuiltIn: true
        }
      ]),
  ...(projectType === ProjectType.SSH
    ? [
        {
          projectId,
          name: "SSH Host Bootstrapper",
          slug: ProjectMembershipRole.SshHostBootstrapper,
          description: "Create and issue SSH Hosts in a project",
          permissions: packedSshHostBootstrap,
          isBuiltIn: true
        }
      ]
    : []),
  ...(projectType === ProjectType.KMS
    ? [
        {
          projectId,
          name: "Cryptographic Operator",
          slug: ProjectMembershipRole.KmsCryptographicOperator,
          description: "Perform cryptographic operations, such as encryption and signing, in a project",
          permissions: packedCryptoOperator,
          isBuiltIn: true
        }
      ]
    : [])
];
