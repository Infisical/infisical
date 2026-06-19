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
  Windows = "windows"
}

export enum PamPolicyType {
  RequireMfa = "require-mfa",
  RequireReason = "require-reason",
  MaxSessionDuration = "max-session-duration"
}

export enum SessionChannelType {
  Terminal = "terminal",
  Exec = "exec",
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
