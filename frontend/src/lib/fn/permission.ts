import { MongoAbility, subject } from "@casl/ability";

import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub,
  SecretSubjectFields
} from "@app/context/ProjectPermissionContext/types";

/**
 * Builds the permission subject for a Secret Sync. Uses connectionId, environment, and secretPath
 * when present so connectionId is still checked even when environment or folder are missing.
 */
export function getSecretSyncPermissionSubject(sync: {
  connectionId?: string;
  environment?: { slug: string } | null;
  folder?: { path: string } | null;
}) {
  const { connectionId, environment, folder } = sync;
  const envSlug = environment?.slug ?? undefined;
  const secretPathVal = folder?.path ?? undefined;
  const hasAny = connectionId || envSlug || secretPathVal;
  if (!hasAny) return ProjectPermissionSub.SecretSyncs;
  return subject(ProjectPermissionSub.SecretSyncs, {
    ...(envSlug && { environment: envSlug }),
    ...(secretPathVal && { secretPath: secretPathVal }),
    ...(connectionId && { connectionId })
  });
}

export function hasSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet>,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue
  >,
  subjectFields?: SecretSubjectFields
) {
  let canNewPermission = false;
  let canOldPermission = false;

  if (subjectFields) {
    canNewPermission = permission.can(action, subject(ProjectPermissionSub.Secrets, subjectFields));
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );
  } else {
    canNewPermission = permission.can(action, ProjectPermissionSub.Secrets);
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSub.Secrets
    );
  }

  return canNewPermission || canOldPermission;
}

const PERMISSION_DISPLAY_NAMES: Record<string, string> = {
  [ProjectPermissionSub.Secrets]: "Secrets",
  [ProjectPermissionSub.SecretFolders]: "Secret Folders",
  [ProjectPermissionSub.SecretImports]: "Secret Imports",
  [ProjectPermissionSub.DynamicSecrets]: "Dynamic Secrets",
  [ProjectPermissionSub.SecretRotation]: "Secret Rotation",
  [ProjectPermissionSub.SecretSyncs]: "Secret Syncs",
  [ProjectPermissionSub.SecretEventSubscriptions]: "Secret Event Subscriptions",
  [ProjectPermissionSub.SecretApproval]: "Secret Approval Policies",
  [ProjectPermissionSub.SecretApprovalRequest]: "Secret Approval Requests",
  [ProjectPermissionSub.Identity]: "Machine Identity Management",
  [ProjectPermissionSub.SshHosts]: "SSH Hosts",
  [ProjectPermissionSub.PkiSubscribers]: "PKI Subscribers",
  [ProjectPermissionSub.CertificateTemplates]: "Certificate Templates",
  [ProjectPermissionSub.CertificateAuthorities]: "Certificate Authorities",
  [ProjectPermissionSub.Certificates]: "Certificates",
  [ProjectPermissionSub.CertificateProfiles]: "Certificate Profiles",
  [ProjectPermissionSub.CertificatePolicies]: "Certificate Policies",
  [ProjectPermissionSub.AppConnections]: "App Connections",
  [ProjectPermissionSub.PamAccounts]: "PAM Accounts",
  [ProjectPermissionSub.McpEndpoints]: "MCP Endpoints",
  [ProjectPermissionSub.Role]: "Roles",
  [ProjectPermissionSub.Member]: "User Management",
  [ProjectPermissionSub.Groups]: "Groups",
  [ProjectPermissionSub.Integrations]: "Native Integrations",
  [ProjectPermissionSub.Webhooks]: "Webhooks",
  [ProjectPermissionSub.AuditLogs]: "Audit Logs",
  [ProjectPermissionSub.Environments]: "Environments",
  [ProjectPermissionSub.IpAllowList]: "IP Allow List",
  [ProjectPermissionSub.Settings]: "Settings",
  [ProjectPermissionSub.ServiceTokens]: "Service Tokens",
  [ProjectPermissionSub.Tags]: "Tags",
  [ProjectPermissionSub.Project]: "Project",
  [ProjectPermissionSub.Cmek]: "KMS",
  [ProjectPermissionSub.Kms]: "Project KMS Configuration",
  [ProjectPermissionSub.Kmip]: "KMIP",
  [ProjectPermissionSub.Commits]: "Commits",
  [ProjectPermissionSub.PamFolders]: "PAM Folders",
  [ProjectPermissionSub.PamResources]: "PAM Resources",
  [ProjectPermissionSub.PamSessions]: "PAM Sessions",
  [ProjectPermissionSub.ApprovalRequests]: "Approval Requests",
  [ProjectPermissionSub.ApprovalRequestGrants]: "Approval Request Grants"
};

export function formatValidationErrorPath(
  path: (string | number)[],
  requestBody?: Record<string, unknown> | null
): string {
  const permissionIndex = path[1];
  const index = typeof permissionIndex === "number" ? permissionIndex : -1;

  // Shows readable name for permission rules validation errors
  if (
    requestBody &&
    path.length >= 3 &&
    path[0] === "permissions" &&
    index >= 0 &&
    path[2] === "action"
  ) {
    const { permissions } = requestBody;
    if (Array.isArray(permissions) && permissions[index]) {
      const { subject: subjectValue } = permissions[index] as { subject?: string };
      if (typeof subjectValue === "string") {
        return PERMISSION_DISPLAY_NAMES[subjectValue] ?? subjectValue;
      }
    }
    return `Permission rule #${index + 1}`;
  }

  return path.join(".");
}
