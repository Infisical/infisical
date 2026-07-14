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

export enum PamResourceRole {
  Admin = "admin",
  Connector = "connector",
  Auditor = "auditor"
}

export enum PamProductRole {
  Admin = "admin",
  Member = "member"
}

export enum PamSessionStatus {
  Starting = "starting",
  Active = "active",
  Ended = "ended",
  Terminated = "terminated"
}

export enum GcpServiceAccountAuthMethod {
  Impersonation = "impersonation",
  StaticKey = "static-key"
}

export enum PamAccessMethod {
  Web = "web",
  Cli = "cli"
}

export enum PamSshAuthMethod {
  Password = "password",
  PublicKey = "public-key",
  Certificate = "certificate"
}

// The caller's just-in-time approval state for an account gated behind an access request flow
export enum PamAccessStatus {
  None = "none",
  Pending = "pending",
  Granted = "granted"
}

export enum PamMemberKind {
  User = "user",
  Group = "group",
  Identity = "identity"
}

// Events a folder's chat notification config can subscribe to
export enum PamNotificationEvent {
  AccessRequested = "access-requested",
  AccessRequestApproved = "access-request-approved",
  AccessRequestDenied = "access-request-denied"
}
