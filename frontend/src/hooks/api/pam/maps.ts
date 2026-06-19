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
  [PamAccountType.Windows]: { name: "Windows", image: "Windows.png" },
  [PamAccountType.ActiveDirectory]: { name: "Windows", image: "Windows.png" }
};

const LEGACY_TYPE_ALIASES: Record<string, PamAccountType> = {
  "active-directory": PamAccountType.Windows
};

const PAM_ACCOUNT_TYPE_FALLBACK = { name: "Unknown", image: "Windows.png" };

export const resolvePamAccountType = (accountType: string): string =>
  LEGACY_TYPE_ALIASES[accountType] ?? accountType;

export const getPamAccountTypeInfo = (accountType: string): { name: string; image: string } => {
  const resolved = LEGACY_TYPE_ALIASES[accountType] ?? accountType;
  return (
    (PAM_ACCOUNT_TYPE_MAP as Record<string, { name: string; image: string }>)[resolved] ??
    PAM_ACCOUNT_TYPE_FALLBACK
  );
};
