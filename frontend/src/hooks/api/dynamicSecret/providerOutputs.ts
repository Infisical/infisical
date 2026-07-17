import { DynamicSecretProviders } from "./types";

// keep field names in sync with the backend registry at backend/src/ee/services/dynamic-secret/providers/dynamic-secret-provider-outputs.ts

export type TProviderOutputField = {
  name: string;
  label: string;
};

export type TProviderLeaseInput =
  | { name: "namespace"; kind: "string"; label: string; helperText: string }
  | { name: "principals"; kind: "string[]"; label: string; helperText: string };

export type TProviderOutputEntry = {
  outputFields: TProviderOutputField[];
  leaseInputs: TProviderLeaseInput[];
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

const kubernetesLeaseInputs: TProviderLeaseInput[] = [
  {
    name: "namespace",
    kind: "string",
    label: "Namespace",
    helperText: "Kubernetes namespace to use. Optional."
  }
];

const sshLeaseInputs: TProviderLeaseInput[] = [
  {
    name: "principals",
    kind: "string[]",
    label: "Principals",
    helperText: "Usernames to include in the certificate."
  }
];

export const DYNAMIC_SECRET_PROVIDER_OUTPUTS: Record<DynamicSecretProviders, TProviderOutputEntry> =
  {
    [DynamicSecretProviders.SqlDatabase]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.Cassandra]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.AwsIam]: {
      outputFields: [
        { name: "ACCESS_KEY", label: "AWS IAM Access Key" },
        { name: "SECRET_ACCESS_KEY", label: "AWS IAM Secret Key" },
        { name: "SESSION_TOKEN", label: "AWS IAM Session Token" },
        { name: "USERNAME", label: "AWS IAM Username" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.Redis]: {
      outputFields: [
        { name: "DB_USERNAME", label: "Redis Username" },
        { name: "DB_PASSWORD", label: "Redis Password" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.AwsElastiCache]: {
      outputFields: [
        { name: "DB_USERNAME", label: "Cluster Username" },
        { name: "DB_PASSWORD", label: "Cluster Password" }
      ],
      leaseInputs: [],
      extraNote: "It may take a few minutes before the credentials are available for use."
    },
    [DynamicSecretProviders.AwsMemoryDb]: {
      outputFields: [
        { name: "DB_USERNAME", label: "Cluster Username" },
        { name: "DB_PASSWORD", label: "Cluster Password" }
      ],
      leaseInputs: [],
      extraNote: "It may take a few minutes before the credentials are available for use."
    },
    [DynamicSecretProviders.MongoAtlas]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.ElasticSearch]: { outputFields: usernamePassword, leaseInputs: [] },
    [DynamicSecretProviders.MongoDB]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.RabbitMq]: { outputFields: usernamePassword, leaseInputs: [] },
    [DynamicSecretProviders.AzureEntraId]: {
      outputFields: [
        { name: "email", label: "Email" },
        { name: "password", label: "Password" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.AzureSqlDatabase]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.Ldap]: {
      outputFields: [
        { name: "USERNAME", label: "Username" },
        { name: "PASSWORD", label: "Password" },
        { name: "DN_ARRAY", label: "DNs" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.SapHana]: { outputFields: usernamePassword, leaseInputs: [] },
    [DynamicSecretProviders.Snowflake]: { outputFields: usernamePassword, leaseInputs: [] },
    [DynamicSecretProviders.Totp]: {
      outputFields: [
        { name: "TOTP", label: "Time-based one-time password" },
        { name: "TIME_REMAINING", label: "Time Remaining" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.SapAse]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.Kubernetes]: {
      outputFields: [{ name: "TOKEN", label: "Service Account JWT" }],
      leaseInputs: kubernetesLeaseInputs
    },
    [DynamicSecretProviders.Vertica]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.GcpIam]: {
      outputFields: [
        { name: "TOKEN", label: "Token" },
        { name: "SERVICE_ACCOUNT_EMAIL", label: "Service Account Email" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.Github]: {
      outputFields: [
        { name: "TOKEN", label: "Token" },
        { name: "EXPIRES_AT", label: "Expires At" },
        { name: "PERMISSIONS", label: "Permissions" },
        { name: "REPOSITORY_SELECTION", label: "Repository Selection" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.Couchbase]: {
      outputFields: [
        { name: "username", label: "Username" },
        { name: "password", label: "Password" }
      ],
      leaseInputs: []
    },
    [DynamicSecretProviders.Clickhouse]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.Milvus]: { outputFields: dbUserPass, leaseInputs: [] },
    [DynamicSecretProviders.Ssh]: {
      outputFields: [
        { name: "PRIVATE_KEY", label: "Private Key" },
        { name: "SIGNED_KEY", label: "Signed Certificate" }
      ],
      leaseInputs: sshLeaseInputs
    },
    [DynamicSecretProviders.IbmApiConnect]: {
      outputFields: [
        { name: "CLIENT_ID", label: "Client ID" },
        { name: "CLIENT_SECRET", label: "Client Secret" }
      ],
      leaseInputs: []
    },
    // Tailscale returns a different subset per auth type (auth key / OAuth client / federated
    // identity); presentFields filtering renders only the keys actually present in the lease.
    [DynamicSecretProviders.Tailscale]: {
      outputFields: [
        { name: "KEY_ID", label: "Key ID" },
        { name: "AUTH_KEY", label: "Auth Key" },
        { name: "CLIENT_ID", label: "Client ID" },
        { name: "CLIENT_SECRET", label: "Client Secret" },
        { name: "FEDERATED_CREDENTIAL_ID", label: "Federated Credential ID" },
        { name: "AUDIENCE", label: "Audience" }
      ],
      leaseInputs: []
    }
  };
