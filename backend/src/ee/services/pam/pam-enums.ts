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
  Requester = "requester",
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
