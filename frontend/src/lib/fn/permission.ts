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
  if (!requestBody) {
    return path.join(".");
  }

  // Find permissions.N.action pattern anywhere in the path
  const permissionsKeyIndex = path.findIndex((segment) => segment === "permissions");
  const permissionIndex = path[permissionsKeyIndex + 1];

  if (
    permissionsKeyIndex === -1 ||
    path[permissionsKeyIndex + 2] !== "action" ||
    typeof permissionIndex !== "number"
  ) {
    return path.join(".");
  }

  // Traverse the path to find the container holding permissions
  let container: unknown = requestBody;
  for (let i = 0; i < permissionsKeyIndex; i += 1) {
    container = (container as Record<string | number, unknown>)?.[path[i]];
  }

  const permissions = (container as { permissions?: { subject?: string }[] })?.permissions;
  const subjectValue = permissions?.[permissionIndex]?.subject;

  if (typeof subjectValue === "string") {
    return PERMISSION_DISPLAY_NAMES[subjectValue] ?? subjectValue;
  }

  return `Permission rule #${permissionIndex + 1}`;
}
