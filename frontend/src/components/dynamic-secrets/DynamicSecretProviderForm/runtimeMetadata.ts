import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

export type TDynamicSecretProviderPresentation = {
  providerFamily: string;
  logoFileName?: string;
};

export type TDynamicSecretLeaseOutputField = {
  key: string;
  label: string;
  isOptional?: boolean;
  format?: "json";
};

export type TDynamicSecretLeaseOutput =
  | {
      type: "fields";
      fields: readonly TDynamicSecretLeaseOutputField[];
      notice?: "one-time" | "one-time-delayed";
    }
  | { type: "totp" }
  | { type: "ssh" };

export type TDynamicSecretLeaseCapabilities = {
  provisioner: "default" | "kubernetes" | "ssh";
  output: TDynamicSecretLeaseOutput;
  supportsRenewal: boolean;
  autoGenerate?: boolean;
  fixedTtl?: string;
};

export type TDynamicSecretProviderRuntimeMetadata = {
  presentation: TDynamicSecretProviderPresentation;
  leaseCapabilities: TDynamicSecretLeaseCapabilities;
};

const oneTimeFields = (
  fields: readonly TDynamicSecretLeaseOutputField[],
  notice: "one-time" | "one-time-delayed" = "one-time"
): TDynamicSecretLeaseOutput => ({ type: "fields", fields, notice });

const databaseCredentials = oneTimeFields([
  { key: "DB_USERNAME", label: "Database User" },
  { key: "DB_PASSWORD", label: "Database Password" }
]);

const credentials = oneTimeFields([
  { key: "DB_USERNAME", label: "Username" },
  { key: "DB_PASSWORD", label: "Password" }
]);

const createDefaultLeaseCapabilities = (
  output: TDynamicSecretLeaseOutput
): TDynamicSecretLeaseCapabilities => ({
  provisioner: "default",
  output,
  supportsRenewal: true
});

const DYNAMIC_SECRET_PROVIDER_RUNTIME_METADATA = {
  [DynamicSecretProviders.SqlDatabase]: {
    presentation: { providerFamily: "SQL", logoFileName: "Postgres.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Cassandra]: {
    presentation: { providerFamily: "Cassandra", logoFileName: "Cassandra.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Redis]: {
    presentation: { providerFamily: "Redis", logoFileName: "Redis.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "DB_USERNAME", label: "Redis Username" },
        { key: "DB_PASSWORD", label: "Redis Password" }
      ])
    )
  },
  [DynamicSecretProviders.AwsElastiCache]: {
    presentation: { providerFamily: "AWS", logoFileName: "Amazon Web Services.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields(
        [
          { key: "DB_USERNAME", label: "Cluster Username" },
          { key: "DB_PASSWORD", label: "Cluster Password" }
        ],
        "one-time-delayed"
      )
    )
  },
  [DynamicSecretProviders.AwsMemoryDb]: {
    presentation: { providerFamily: "AWS", logoFileName: "Amazon Web Services.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields(
        [
          { key: "DB_USERNAME", label: "Cluster Username" },
          { key: "DB_PASSWORD", label: "Cluster Password" }
        ],
        "one-time-delayed"
      )
    )
  },
  [DynamicSecretProviders.AwsIam]: {
    presentation: { providerFamily: "AWS", logoFileName: "Amazon Web Services.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "USERNAME", label: "AWS IAM Username", isOptional: true },
        { key: "ACCESS_KEY", label: "AWS IAM Access Key" },
        { key: "SECRET_ACCESS_KEY", label: "AWS IAM Secret Key" },
        { key: "SESSION_TOKEN", label: "AWS IAM Session Token", isOptional: true }
      ])
    )
  },
  [DynamicSecretProviders.MongoAtlas]: {
    presentation: { providerFamily: "MongoDB", logoFileName: "MongoDB.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.MongoDB]: {
    presentation: { providerFamily: "MongoDB", logoFileName: "MongoDB.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.ElasticSearch]: {
    presentation: { providerFamily: "Elastic", logoFileName: "Elastic.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(credentials)
  },
  [DynamicSecretProviders.RabbitMq]: {
    presentation: { providerFamily: "RabbitMQ" },
    leaseCapabilities: createDefaultLeaseCapabilities(credentials)
  },
  [DynamicSecretProviders.AzureEntraId]: {
    presentation: { providerFamily: "Azure", logoFileName: "Microsoft Azure.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "email", label: "Email" },
        { key: "password", label: "Password" }
      ])
    )
  },
  [DynamicSecretProviders.AzureSqlDatabase]: {
    presentation: { providerFamily: "Azure", logoFileName: "Microsoft Azure.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Ldap]: {
    presentation: { providerFamily: "LDAP", logoFileName: "LDAP.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "USERNAME", label: "Username" },
        { key: "PASSWORD", label: "Password" },
        { key: "DN_ARRAY", label: "DNs", format: "json" }
      ])
    )
  },
  [DynamicSecretProviders.SapHana]: {
    presentation: { providerFamily: "SAP" },
    leaseCapabilities: createDefaultLeaseCapabilities(credentials)
  },
  [DynamicSecretProviders.SapAse]: {
    presentation: { providerFamily: "SAP" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Snowflake]: {
    presentation: { providerFamily: "Snowflake", logoFileName: "Snowflake.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(credentials)
  },
  [DynamicSecretProviders.Totp]: {
    presentation: { providerFamily: "TOTP" },
    leaseCapabilities: {
      ...createDefaultLeaseCapabilities({ type: "totp" }),
      autoGenerate: true
    }
  },
  [DynamicSecretProviders.Vertica]: {
    presentation: { providerFamily: "Vertica" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Kubernetes]: {
    presentation: { providerFamily: "Kubernetes", logoFileName: "Kubernetes.png" },
    leaseCapabilities: {
      provisioner: "kubernetes",
      output: oneTimeFields([{ key: "TOKEN", label: "Service Account JWT" }]),
      supportsRenewal: true
    }
  },
  [DynamicSecretProviders.GcpIam]: {
    presentation: { providerFamily: "Google Cloud", logoFileName: "Google Cloud Platform.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "SERVICE_ACCOUNT_EMAIL", label: "Service Account Email" },
        { key: "TOKEN", label: "Token" }
      ])
    )
  },
  [DynamicSecretProviders.Github]: {
    presentation: { providerFamily: "GitHub", logoFileName: "GitHub.png" },
    leaseCapabilities: {
      ...createDefaultLeaseCapabilities(oneTimeFields([{ key: "TOKEN", label: "Token" }])),
      fixedTtl: "1h",
      supportsRenewal: false
    }
  },
  [DynamicSecretProviders.Couchbase]: {
    presentation: { providerFamily: "Couchbase" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "username", label: "Username" },
        { key: "password", label: "Password" }
      ])
    )
  },
  [DynamicSecretProviders.Milvus]: {
    presentation: { providerFamily: "Milvus" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Clickhouse]: {
    presentation: { providerFamily: "ClickHouse" },
    leaseCapabilities: createDefaultLeaseCapabilities(databaseCredentials)
  },
  [DynamicSecretProviders.Ssh]: {
    presentation: { providerFamily: "SSH", logoFileName: "SSH.png" },
    leaseCapabilities: {
      provisioner: "ssh",
      output: { type: "ssh" },
      supportsRenewal: false
    }
  },
  [DynamicSecretProviders.IbmApiConnect]: {
    presentation: { providerFamily: "IBM", logoFileName: "IBM.png" },
    leaseCapabilities: createDefaultLeaseCapabilities(
      oneTimeFields([
        { key: "CLIENT_ID", label: "Client ID" },
        { key: "CLIENT_SECRET", label: "Client Secret" }
      ])
    )
  },
  [DynamicSecretProviders.Tailscale]: {
    presentation: { providerFamily: "Tailscale" },
    leaseCapabilities: {
      provisioner: "default",
      output: oneTimeFields([
        { key: "KEY_ID", label: "Key ID", isOptional: true },
        { key: "AUTH_KEY", label: "Auth Key", isOptional: true },
        { key: "CLIENT_ID", label: "Client ID", isOptional: true },
        { key: "CLIENT_SECRET", label: "Client Secret", isOptional: true },
        { key: "FEDERATED_CREDENTIAL_ID", label: "Federated Credential ID", isOptional: true },
        { key: "AUDIENCE", label: "Audience", isOptional: true }
      ]),
      supportsRenewal: false
    }
  }
} as const satisfies Record<DynamicSecretProviders, TDynamicSecretProviderRuntimeMetadata>;

export const getDynamicSecretProviderRuntimeMetadata = (
  provider: DynamicSecretProviders
): TDynamicSecretProviderRuntimeMetadata => DYNAMIC_SECRET_PROVIDER_RUNTIME_METADATA[provider];
