export enum PamAccountType {
  SSH = "ssh",
  Postgres = "postgres",
  MySQL = "mysql",
  MsSQL = "mssql",
  OracleDB = "oracledb",
  MongoDB = "mongodb",
  Redis = "redis",
  Kubernetes = "kubernetes",
  AwsIam = "aws-iam",
  Windows = "windows",
  WindowsAd = "windows-ad"
}

export const ROTATABLE_PAM_ACCOUNT_TYPES = [
  PamAccountType.Postgres,
  PamAccountType.MySQL,
  PamAccountType.MsSQL
];

export const isRotatablePamAccountType = (type: PamAccountType | string) =>
  (ROTATABLE_PAM_ACCOUNT_TYPES as string[]).includes(type);

export const PAM_ROTATION_INTERVAL_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 43200, label: "12 hours" },
  { seconds: 86400, label: "24 hours" },
  { seconds: 604800, label: "7 days" },
  { seconds: 2592000, label: "30 days" }
];

export const formatRotationInterval = (seconds: number | null | undefined): string => {
  if (!seconds) return "Not set";
  const preset = PAM_ROTATION_INTERVAL_OPTIONS.find((option) => option.seconds === seconds);
  if (preset) return preset.label;
  const hours = Math.round(seconds / 3600);
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
};

export enum PamPolicyType {
  RequireMfa = "require-mfa",
  RequireReason = "require-reason",
  MaxSessionDuration = "max-session-duration",
  CommandBlocking = "command-blocking"
}

export enum SessionChannelType {
  Terminal = "terminal",
  Exec = "exec",
  Sftp = "sftp",
  Rdp = "rdp"
}

export enum PamSessionStatus {
  Starting = "starting",
  Active = "active",
  Ended = "ended",
  Terminated = "terminated"
}

export enum PamAccountOrderBy {
  Name = "name"
}

export enum PamAccountView {
  Flat = "flat",
  Nested = "nested"
}

export enum PamResourcePermissionSub {
  PamResource = "pam-resource"
}

export enum PamResourcePermissionActions {
  ReadFolder = "read-folder",
  EditFolder = "edit-folder",
  DeleteFolder = "delete-folder",
  ReadAccounts = "read-accounts",
  CreateAccounts = "create-accounts",
  EditAccounts = "edit-accounts",
  DeleteAccounts = "delete-accounts",
  LaunchSessions = "launch-sessions",
  ViewSessions = "view-sessions",
  TerminateSessions = "terminate-sessions",
  ViewCredentials = "view-credentials",
  RequestAccess = "request-access",
  ApproveRequests = "approve-requests",
  ManagePolicies = "manage-policies",
  ManageRotation = "manage-rotation",
  ManageMembers = "manage-members",
  ViewAuditLogs = "view-audit-logs"
}
