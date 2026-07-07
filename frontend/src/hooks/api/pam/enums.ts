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
  GcpServiceAccount = "gcp-service-account",
  Windows = "windows",
  WindowsAd = "windows-ad"
}

export enum PamPolicyType {
  RequiresApproval = "requires-approval",
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
  ApproveRequests = "approve-requests",
  RevokeGrants = "revoke-grants",
  ManagePolicies = "manage-policies",
  ManageRotation = "manage-rotation",
  ManageMembers = "manage-members",
  ViewAuditLogs = "view-audit-logs"
}

// The caller's just-in-time approval state for an account gated behind an access request flow
export enum PamAccessStatus {
  None = "none",
  Pending = "pending",
  Granted = "granted"
}

export enum PamAccessRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Expired = "expired",
  Cancelled = "cancelled"
}

export enum PamAccessRequestDecision {
  Approved = "approved",
  Rejected = "rejected"
}

export enum PamAccessGrantStatus {
  Active = "active",
  Expired = "expired",
  Revoked = "revoked"
}

export enum PamApproverType {
  User = "user",
  Group = "group"
}
