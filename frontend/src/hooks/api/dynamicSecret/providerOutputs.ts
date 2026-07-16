import { DynamicSecretProviders } from "./types";

// keep field names in sync with the backend registry at backend/src/ee/services/dynamic-secret/providers/dynamic-secret-provider-outputs.ts

export type TProviderOutputField = {
  name: string;
  label: string;
};

export type TProviderOutputEntry = {
  outputFields: TProviderOutputField[];
  extraNote?: string;
};

const dbUserPass: TProviderOutputField[] = [
  { name: "DB_USERNAME", label: "Database User" },
  { name: "DB_PASSWORD", label: "Database Password" }
];

const usernamePassword: TProviderOutputField[] = [
  { name: "DB_USERNAME", label: "Username" },
  { name: "DB_PASSWORD", label: "Password" }
];

export const DYNAMIC_SECRET_PROVIDER_OUTPUTS: Record<DynamicSecretProviders, TProviderOutputEntry> =
  {
    [DynamicSecretProviders.SqlDatabase]: { outputFields: dbUserPass },
    [DynamicSecretProviders.Cassandra]: { outputFields: dbUserPass },
    [DynamicSecretProviders.AwsIam]: {
      outputFields: [
        { name: "ACCESS_KEY", label: "AWS IAM Access Key" },
        { name: "SECRET_ACCESS_KEY", label: "AWS IAM Secret Key" },
        { name: "SESSION_TOKEN", label: "AWS IAM Session Token" },
        { name: "USERNAME", label: "AWS IAM Username" }
      ]
    },
    [DynamicSecretProviders.Redis]: {
      outputFields: [
        { name: "DB_USERNAME", label: "Redis Username" },
        { name: "DB_PASSWORD", label: "Redis Password" }
      ]
    },
    [DynamicSecretProviders.AwsElastiCache]: {
      outputFields: [
        { name: "DB_USERNAME", label: "Cluster Username" },
        { name: "DB_PASSWORD", label: "Cluster Password" }
      ],
      extraNote: "It may take a few minutes before the credentials are available for use."
    },
    [DynamicSecretProviders.AwsMemoryDb]: {
      outputFields: [
        { name: "DB_USERNAME", label: "Cluster Username" },
        { name: "DB_PASSWORD", label: "Cluster Password" }
      ],
      extraNote: "It may take a few minutes before the credentials are available for use."
    },
    [DynamicSecretProviders.MongoAtlas]: { outputFields: dbUserPass },
    [DynamicSecretProviders.ElasticSearch]: { outputFields: usernamePassword },
    [DynamicSecretProviders.MongoDB]: { outputFields: dbUserPass },
    [DynamicSecretProviders.RabbitMq]: { outputFields: usernamePassword },
    [DynamicSecretProviders.AzureEntraId]: {
      outputFields: [
        { name: "email", label: "Email" },
        { name: "password", label: "Password" }
      ]
    },
    [DynamicSecretProviders.AzureSqlDatabase]: { outputFields: dbUserPass },
    [DynamicSecretProviders.Ldap]: {
      outputFields: [
        { name: "USERNAME", label: "Username" },
        { name: "PASSWORD", label: "Password" },
        { name: "DN_ARRAY", label: "DNs" }
      ]
    },
    [DynamicSecretProviders.SapHana]: { outputFields: usernamePassword },
    [DynamicSecretProviders.Snowflake]: { outputFields: usernamePassword },
    [DynamicSecretProviders.Totp]: {
      outputFields: [
        { name: "TOTP", label: "Time-based one-time password" },
        { name: "TIME_REMAINING", label: "Time Remaining" }
      ]
    },
    [DynamicSecretProviders.SapAse]: { outputFields: dbUserPass },
    [DynamicSecretProviders.Kubernetes]: {
      outputFields: [{ name: "TOKEN", label: "Service Account JWT" }]
    },
    [DynamicSecretProviders.Vertica]: { outputFields: dbUserPass },
    [DynamicSecretProviders.GcpIam]: {
      outputFields: [
        { name: "TOKEN", label: "Token" },
        { name: "SERVICE_ACCOUNT_EMAIL", label: "Service Account Email" }
      ]
    },
    [DynamicSecretProviders.Github]: {
      outputFields: [
        { name: "TOKEN", label: "Token" },
        { name: "EXPIRES_AT", label: "Expires At" },
        { name: "PERMISSIONS", label: "Permissions" },
        { name: "REPOSITORY_SELECTION", label: "Repository Selection" }
      ]
    },
    [DynamicSecretProviders.Couchbase]: {
      outputFields: [
        { name: "username", label: "Username" },
        { name: "password", label: "Password" }
      ]
    },
    [DynamicSecretProviders.Clickhouse]: { outputFields: dbUserPass },
    [DynamicSecretProviders.Milvus]: { outputFields: dbUserPass },
    [DynamicSecretProviders.Ssh]: {
      outputFields: [
        { name: "PRIVATE_KEY", label: "Private Key" },
        { name: "SIGNED_KEY", label: "Signed Certificate" }
      ]
    },
    [DynamicSecretProviders.IbmApiConnect]: {
      outputFields: [
        { name: "CLIENT_ID", label: "Client ID" },
        { name: "CLIENT_SECRET", label: "Client Secret" }
      ]
    }
  };
