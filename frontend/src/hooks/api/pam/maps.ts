import { PamAccountType } from "./enums";

export const PAM_ACCOUNT_TYPE_MAP: Record<PamAccountType, { name: string; image: string }> = {
  [PamAccountType.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [PamAccountType.MySQL]: { name: "MySQL", image: "MySql.png" },
  [PamAccountType.SSH]: { name: "SSH", image: "SSH.png" },
  [PamAccountType.Kubernetes]: { name: "Kubernetes", image: "Kubernetes.png" },
  [PamAccountType.OracleDB]: { name: "OracleDB", image: "Oracle.png" },
  [PamAccountType.MsSQL]: { name: "Microsoft SQL Server", image: "MsSql.png" },
  [PamAccountType.Redis]: { name: "Redis", image: "Redis.png" },
  [PamAccountType.MongoDB]: { name: "MongoDB", image: "MongoDB.png" },
  [PamAccountType.AwsIam]: { name: "AWS IAM", image: "Amazon Web Services.png" },
  [PamAccountType.Windows]: { name: "Windows Server", image: "Windows.png" },
  [PamAccountType.ActiveDirectory]: { name: "Active Directory", image: "Windows.png" }
};
