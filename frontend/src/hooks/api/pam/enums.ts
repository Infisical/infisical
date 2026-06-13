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
