// The built-in roles now live with their owners; this file keeps the old import path working until the
// permission engine moves out of ee/services/permission.
export {
  agentVaultProjectAdminPermissions,
  agentVaultProjectMemberPermissions
} from "@app/domains/agent-vault/agent-vault/ce/module";
export {
  applicationAdminPermissions,
  applicationAuditorPermissions,
  applicationOperatorPermissions,
  projectAdminApplicationFallbackPermissions
} from "@app/domains/certificates/cert-manager/ce/module";
export {
  projectAdminSignerFallbackPermissions,
  signerAdminPermissions,
  signerAuditorPermissions,
  signerOperatorPermissions
} from "@app/domains/certificates/code-signing/ce/module";
export { cryptographicOperatorPermissions } from "@app/domains/kms/kms/ce/module";
export {
  pamProjectAdminPermissions,
  pamProjectMemberPermissions,
  pamResourceAdminPermissions,
  pamResourceAuditorPermissions,
  pamResourceConnectorPermissions,
  pamResourceOperatorPermissions
} from "@app/domains/pam/pam/ce/module";
export {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission
} from "@app/domains/platform/projects/ce/module";
