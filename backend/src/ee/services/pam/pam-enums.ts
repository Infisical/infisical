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

const LEGACY_ACCOUNT_TYPE_ALIASES: Record<string, PamAccountType> = {
  "active-directory": PamAccountType.Windows
};

export const resolveAccountType = (raw: string): PamAccountType =>
  LEGACY_ACCOUNT_TYPE_ALIASES[raw] ?? (raw as PamAccountType);

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
