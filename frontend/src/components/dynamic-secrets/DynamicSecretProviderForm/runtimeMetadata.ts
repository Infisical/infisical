import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

export type TDynamicSecretProviderPresentation = {
  brand: string;
  image?: string;
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
  lease: TDynamicSecretLeaseCapabilities;
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

const defaultLease = (output: TDynamicSecretLeaseOutput): TDynamicSecretLeaseCapabilities => ({
  provisioner: "default",
  output,
  supportsRenewal: true
});

const DYNAMIC_SECRET_PROVIDER_RUNTIME_METADATA = {
  [DynamicSecretProviders.SqlDatabase]: {
    presentation: { brand: "SQL", image: "Postgres.png" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Cassandra]: {
    presentation: { brand: "Cassandra", image: "Cassandra.png" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Redis]: {
    presentation: { brand: "Redis", image: "Redis.png" },
    lease: defaultLease(
      oneTimeFields([
        { key: "DB_USERNAME", label: "Redis Username" },
        { key: "DB_PASSWORD", label: "Redis Password" }
      ])
    )
  },
  [DynamicSecretProviders.AwsElastiCache]: {
    presentation: { brand: "AWS", image: "Amazon Web Services.png" },
    lease: defaultLease(
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
    presentation: { brand: "AWS", image: "Amazon Web Services.png" },
    lease: defaultLease(
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
    presentation: { brand: "AWS", image: "Amazon Web Services.png" },
    lease: defaultLease(
      oneTimeFields([
        { key: "USERNAME", label: "AWS IAM Username", isOptional: true },
        { key: "ACCESS_KEY", label: "AWS IAM Access Key" },
        { key: "SECRET_ACCESS_KEY", label: "AWS IAM Secret Key" },
        { key: "SESSION_TOKEN", label: "AWS IAM Session Token", isOptional: true }
      ])
    )
  },
  [DynamicSecretProviders.MongoAtlas]: {
    presentation: { brand: "MongoDB", image: "MongoDB.png" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.MongoDB]: {
    presentation: { brand: "MongoDB", image: "MongoDB.png" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.ElasticSearch]: {
    presentation: { brand: "Elastic", image: "Elastic.png" },
    lease: defaultLease(credentials)
  },
  [DynamicSecretProviders.RabbitMq]: {
    presentation: { brand: "RabbitMQ" },
    lease: defaultLease(credentials)
  },
  [DynamicSecretProviders.AzureEntraId]: {
    presentation: { brand: "Azure", image: "Microsoft Azure.png" },
    lease: defaultLease(
      oneTimeFields([
        { key: "email", label: "Email" },
        { key: "password", label: "Password" }
      ])
    )
  },
  [DynamicSecretProviders.AzureSqlDatabase]: {
    presentation: { brand: "Azure", image: "Microsoft Azure.png" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Ldap]: {
    presentation: { brand: "LDAP", image: "LDAP.png" },
    lease: defaultLease(
      oneTimeFields([
        { key: "USERNAME", label: "Username" },
        { key: "PASSWORD", label: "Password" },
        { key: "DN_ARRAY", label: "DNs", format: "json" }
      ])
    )
  },
  [DynamicSecretProviders.SapHana]: {
    presentation: { brand: "SAP" },
    lease: defaultLease(credentials)
  },
  [DynamicSecretProviders.SapAse]: {
    presentation: { brand: "SAP" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Snowflake]: {
    presentation: { brand: "Snowflake", image: "Snowflake.png" },
    lease: defaultLease(credentials)
  },
  [DynamicSecretProviders.Totp]: {
    presentation: { brand: "TOTP" },
    lease: { ...defaultLease({ type: "totp" }), autoGenerate: true }
  },
  [DynamicSecretProviders.Vertica]: {
    presentation: { brand: "Vertica" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Kubernetes]: {
    presentation: { brand: "Kubernetes", image: "Kubernetes.png" },
    lease: {
      provisioner: "kubernetes",
      output: oneTimeFields([{ key: "TOKEN", label: "Service Account JWT" }]),
      supportsRenewal: true
    }
  },
  [DynamicSecretProviders.GcpIam]: {
    presentation: { brand: "Google Cloud", image: "Google Cloud Platform.png" },
    lease: defaultLease(
      oneTimeFields([
        { key: "SERVICE_ACCOUNT_EMAIL", label: "Service Account Email" },
        { key: "TOKEN", label: "Token" }
      ])
    )
  },
  [DynamicSecretProviders.Github]: {
    presentation: { brand: "GitHub", image: "GitHub.png" },
    lease: {
      ...defaultLease(oneTimeFields([{ key: "TOKEN", label: "Token" }])),
      fixedTtl: "1h",
      supportsRenewal: false
    }
  },
  [DynamicSecretProviders.Couchbase]: {
    presentation: { brand: "Couchbase" },
    lease: defaultLease(
      oneTimeFields([
        { key: "username", label: "Username" },
        { key: "password", label: "Password" }
      ])
    )
  },
  [DynamicSecretProviders.Milvus]: {
    presentation: { brand: "Milvus" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Clickhouse]: {
    presentation: { brand: "ClickHouse" },
    lease: defaultLease(databaseCredentials)
  },
  [DynamicSecretProviders.Ssh]: {
    presentation: { brand: "SSH", image: "SSH.png" },
    lease: {
      provisioner: "ssh",
      output: { type: "ssh" },
      supportsRenewal: false
    }
  },
  [DynamicSecretProviders.IbmApiConnect]: {
    presentation: { brand: "IBM", image: "IBM.png" },
    lease: defaultLease(
      oneTimeFields([
        { key: "CLIENT_ID", label: "Client ID" },
        { key: "CLIENT_SECRET", label: "Client Secret" }
      ])
    )
  },
  [DynamicSecretProviders.Tailscale]: {
    presentation: { brand: "Tailscale" },
    lease: {
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
