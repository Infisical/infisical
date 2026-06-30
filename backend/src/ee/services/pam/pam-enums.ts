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
  GcpIam = "gcp-iam",
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

export enum PamAccessMethod {
  Web = "web",
  Cli = "cli"
}
