import { PamAccountType, PamResourceType } from "./enums";

export const PAM_RESOURCE_TYPE_MAP: Record<
  PamResourceType,
  { name: string; image: string; size?: number }
> = {
  [PamResourceType.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [PamResourceType.MySQL]: { name: "MySQL", image: "MySql.png" },
  [PamResourceType.SSH]: { name: "SSH", image: "SSH.png" },
  [PamResourceType.Kubernetes]: { name: "Kubernetes", image: "Kubernetes.png" },
  [PamResourceType.OracleDB]: { name: "OracleDB", image: "Oracle.png", size: 55 },
  [PamResourceType.SQLite]: { name: "SQLite", image: "SQLite.png" },
  [PamResourceType.MsSQL]: { name: "Microsoft SQL Server", image: "MsSql.png" },
  [PamResourceType.MCP]: { name: "MCP", image: "MCP.png" },
  [PamResourceType.Redis]: { name: "Redis", image: "Redis.png" },
  [PamResourceType.MongoDB]: { name: "MongoDB", image: "MongoDB.png" },
  [PamResourceType.WebApp]: { name: "Web Application", image: "Web.png" },
  [PamResourceType.Cassandra]: { name: "Cassandra", image: "Cassandra.png", size: 55 },
  [PamResourceType.CockroachDB]: { name: "CockroachDB", image: "CockroachDB.png" },
  [PamResourceType.Elasticsearch]: { name: "Elasticsearch", image: "Elastic.png" },
  [PamResourceType.Snowflake]: { name: "Snowflake", image: "Snowflake.png" },
  [PamResourceType.DynamoDB]: { name: "DynamoDB", image: "DynamoDB.png", size: 55 },
  [PamResourceType.AwsIam]: { name: "AWS IAM", image: "Amazon Web Services.png" },
  [PamResourceType.Windows]: { name: "Windows Server", image: "Windows.png" }
};

export const PAM_ACCOUNT_TYPE_MAP: Record<
  PamAccountType,
  { name: string; image: string; size?: number }
> = {
  [PamAccountType.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [PamAccountType.MySQL]: { name: "MySQL", image: "MySql.png" },
  [PamAccountType.SSH]: { name: "SSH", image: "SSH.png" },
  [PamAccountType.Kubernetes]: { name: "Kubernetes", image: "Kubernetes.png" },
  [PamAccountType.OracleDB]: { name: "OracleDB", image: "Oracle.png", size: 55 },
  [PamAccountType.MsSQL]: { name: "Microsoft SQL Server", image: "MsSql.png" },
  [PamAccountType.Redis]: { name: "Redis", image: "Redis.png" },
  [PamAccountType.MongoDB]: { name: "MongoDB", image: "MongoDB.png" },
  [PamAccountType.AwsIam]: { name: "AWS IAM", image: "Amazon Web Services.png" },
  [PamAccountType.Windows]: { name: "Windows Server", image: "Windows.png" },
  [PamAccountType.ActiveDirectory]: { name: "Active Directory", image: "Windows.png" }
};
