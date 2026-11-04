export const pamAccountTypeCategories = ["All", "Databases", "Servers", "Clusters", "Cloud Providers"];

export const pamAccountTypeBadges = (accountType) => [
  { label: accountType.category },
  ...(accountType.browserAccess ? [{ label: "Browser access", color: "green" }] : []),
];

export const pamAccountTypes = [
  {
    name: "PostgreSQL",
    path: "/documentation/platform/pam/accounts/postgresql",
    description: "Give people and agents access to a PostgreSQL database without sharing its credentials.",
    category: "Databases",
    browserAccess: true,
  },
  {
    name: "MySQL",
    path: "/documentation/platform/pam/accounts/mysql",
    description: "Give people and agents access to a MySQL database without sharing its credentials.",
    category: "Databases",
    browserAccess: true,
  },
  {
    name: "Microsoft SQL Server",
    path: "/documentation/platform/pam/accounts/mssql",
    description: "Give people and agents access to a Microsoft SQL Server database without sharing its credentials.",
    category: "Databases",
    browserAccess: false,
  },
  {
    name: "Oracle",
    path: "/documentation/platform/pam/accounts/oracledb",
    description: "Give people and agents access to an Oracle database without sharing its credentials.",
    category: "Databases",
    browserAccess: false,
  },
  {
    name: "MongoDB",
    path: "/documentation/platform/pam/accounts/mongodb",
    description: "Give people and agents access to a MongoDB database without sharing its credentials.",
    category: "Databases",
    browserAccess: false,
  },
  {
    name: "Redis",
    path: "/documentation/platform/pam/accounts/redis",
    description: "Give people and agents access to a Redis database without sharing its credentials.",
    category: "Databases",
    browserAccess: true,
  },
  {
    name: "Snowflake",
    path: "/documentation/platform/pam/accounts/snowflake",
    description: "Give people and agents access to a Snowflake database without sharing its credentials.",
    category: "Databases",
    browserAccess: true,
  },
  {
    name: "ClickHouse",
    path: "/documentation/platform/pam/accounts/clickhouse",
    description: "Give people and agents access to a ClickHouse database without sharing its credentials.",
    category: "Databases",
    browserAccess: true,
  },
  {
    name: "SSH",
    path: "/documentation/platform/pam/accounts/ssh",
    description: "Give people shell access to Linux and Unix servers.",
    category: "Servers",
    browserAccess: true,
  },
  {
    name: "Windows",
    path: "/documentation/platform/pam/accounts/windows",
    description: "Give people remote desktop access to a Windows server with a local account.",
    category: "Servers",
    browserAccess: true,
  },
  {
    name: "Windows AD",
    path: "/documentation/platform/pam/accounts/windows-ad",
    description: "Give people remote desktop access to Windows servers with an Active Directory account.",
    category: "Servers",
    browserAccess: true,
  },
  {
    name: "Kubernetes",
    path: "/documentation/platform/pam/accounts/kubernetes",
    description: "Give people kubectl access to Kubernetes clusters.",
    category: "Clusters",
    browserAccess: false,
  },
  {
    name: "AWS IAM",
    path: "/documentation/platform/pam/accounts/aws-iam",
    description: "Give people temporary access to AWS through an IAM role.",
    category: "Cloud Providers",
    browserAccess: true,
  },
  {
    name: "GCP service account",
    path: "/documentation/platform/pam/accounts/gcp-service-account",
    description: "Give people gcloud access to Google Cloud as a service account.",
    category: "Cloud Providers",
    browserAccess: false,
  },
  {
    name: "Azure CLI",
    path: "/documentation/platform/pam/accounts/azure-cli",
    description: "Give people Azure CLI access to Azure as a service principal.",
    category: "Cloud Providers",
    browserAccess: false,
  },
];
