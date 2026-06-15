export enum PamResourceType {
  Postgres = "postgres",
  MySQL = "mysql",
  SSH = "ssh",
  Kubernetes = "kubernetes",
  OracleDB = "oracledb",
  SQLite = "sqlite",
  MsSQL = "mssql",
  MCP = "mcp",
  Redis = "redis",
  MongoDB = "mongodb",
  WebApp = "webapp",
  Cassandra = "cassandra",
  CockroachDB = "cockroachdb",
  Elasticsearch = "elasticsearch",
  Snowflake = "snowflake",
  DynamoDB = "dynamodb",
  AwsIam = "aws-iam",
  Windows = "windows"
}

export enum SessionChannelType {
  Terminal = "terminal",
  Exec = "exec",
  Sftp = "sftp"
}

export enum PamSessionStatus {
  Starting = "starting",
  Active = "active",
  Ended = "ended",
  Terminated = "terminated"
}

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
  ActiveDirectory = "active-directory"
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
