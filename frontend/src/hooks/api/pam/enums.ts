// Resources
export enum PamResourceType {
  Postgres = "postgres",
  MySQL = "mysql",
  RDP = "rdp",
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

export enum PamResourceOrderBy {
  Name = "name"
}

// Sessions
export enum PamSessionStatus {
  Starting = "starting",
  Active = "active",
  Ended = "ended",
  Terminated = "terminated"
}

// Accounts
export enum PamAccountOrderBy {
  Name = "name"
}

export enum PamAccountView {
  Flat = "flat",
  Nested = "nested"
}
