import { PamResourceType } from "./enums";

export const PAM_RESOURCE_TYPE_MAP: Record<
  PamResourceType,
  { name: string; image: string; size?: number }
> = {
  [PamResourceType.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [PamResourceType.MySQL]: { name: "MySQL", image: "MySql.png" },
  [PamResourceType.RDP]: { name: "RDP", image: "RDP.png" },
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
  [PamResourceType.Windows]: { name: "Windows Server", image: "Windows.png" },
  [PamResourceType.ActiveDirectory]: { name: "Active Directory", image: "ActiveDirectory.png" }
};
