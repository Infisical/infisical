import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

export type TProviderLeaseInput =
  | { name: "namespace"; kind: "string"; label: string; helperText: string }
  | { name: "principals"; kind: "string[]"; label: string; helperText: string };

type TBrokerableDynamicSecret = {
  fields: { name: string; label: string }[];
  leaseInputs?: TProviderLeaseInput[];
};

// Dynamic-secret providers a proxied service can broker over HTTP, with the eligible output fields and any
// lease inputs. A provider not listed can't be brokered; a field not listed is hidden (e.g. metadata).
// keep in sync with backend/src/ee/services/proxied-service/proxied-service-brokerable-outputs.ts
export const BROKERABLE_DYNAMIC_SECRETS: Partial<
  Record<DynamicSecretProviders, TBrokerableDynamicSecret>
> = {
  [DynamicSecretProviders.Kubernetes]: {
    fields: [{ name: "TOKEN", label: "Service Account JWT" }],
    leaseInputs: [
      {
        name: "namespace",
        kind: "string",
        label: "Namespace",
        helperText: "Kubernetes namespace to use. Optional."
      }
    ]
  },
  [DynamicSecretProviders.Github]: { fields: [{ name: "TOKEN", label: "Token" }] },
  [DynamicSecretProviders.GcpIam]: { fields: [{ name: "TOKEN", label: "Token" }] },
  [DynamicSecretProviders.IbmApiConnect]: {
    fields: [
      { name: "CLIENT_ID", label: "Client ID" },
      { name: "CLIENT_SECRET", label: "Client Secret" }
    ]
  },
  [DynamicSecretProviders.ElasticSearch]: {
    fields: [
      { name: "DB_USERNAME", label: "Username" },
      { name: "DB_PASSWORD", label: "Password" }
    ]
  },
  [DynamicSecretProviders.Clickhouse]: {
    fields: [
      { name: "DB_USERNAME", label: "Database User" },
      { name: "DB_PASSWORD", label: "Database Password" }
    ]
  },
  [DynamicSecretProviders.Couchbase]: {
    fields: [
      { name: "username", label: "Username" },
      { name: "password", label: "Password" }
    ]
  },
  [DynamicSecretProviders.RabbitMq]: {
    fields: [
      { name: "DB_USERNAME", label: "Username" },
      { name: "DB_PASSWORD", label: "Password" }
    ]
  },
  [DynamicSecretProviders.Snowflake]: {
    fields: [
      { name: "DB_USERNAME", label: "Username" },
      { name: "DB_PASSWORD", label: "Password" }
    ]
  },
  [DynamicSecretProviders.Milvus]: {
    fields: [
      { name: "DB_USERNAME", label: "Database User" },
      { name: "DB_PASSWORD", label: "Database Password" }
    ]
  },
  [DynamicSecretProviders.AzureEntraId]: {
    fields: [
      { name: "email", label: "Email" },
      { name: "password", label: "Password" }
    ]
  },
  [DynamicSecretProviders.Totp]: {
    fields: [{ name: "TOTP", label: "Time-based one-time password" }]
  }
};
