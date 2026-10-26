import { SecretSync, SecretSyncStatus } from "@app/hooks/api/secretSyncs/enums";

export type LocalSecretSync = {
  id: string;
  name: string;
  destination: string;
  project: string;
  environment: string;
  path: string;
  status: "succeeded" | "failed" | "running" | "pending" | null;
  autoSync: boolean;
  lastSyncedAt?: string;
  lastSyncMessage?: string;
  description?: string;
  connectionId?: string;
  connectionName?: string;
  destinationConfig?: Record<string, unknown>;
  syncOptions?: Record<string, unknown>;
};

export const PORTED_SYNCS: readonly SecretSync[] = [
  SecretSync.AWSParameterStore,
  SecretSync.AWSSecretsManager,
  SecretSync.GitHub,
  SecretSync.GCPSecretManager,
  SecretSync.AzureKeyVault,
  SecretSync.Vercel
];

export const IMPORT_CAPABLE_SYNCS: readonly SecretSync[] = [
  SecretSync.OnePass,
  SecretSync.AWSParameterStore,
  SecretSync.AWSSecretsManager,
  SecretSync.AzureAppConfiguration,
  SecretSync.AzureKeyVault,
  SecretSync.Camunda,
  SecretSync.Cloud66,
  SecretSync.ExternalInfisical,
  SecretSync.GCPSecretManager,
  SecretSync.HasuraCloud,
  SecretSync.HCVault,
  SecretSync.Heroku,
  SecretSync.Keeper,
  SecretSync.LaravelForge,
  SecretSync.Netlify,
  SecretSync.Northflank,
  SecretSync.OVH,
  SecretSync.Portainer,
  SecretSync.Railway,
  SecretSync.Render,
  SecretSync.TeamCity,
  SecretSync.Vercel,
  SecretSync.Windmill,
  SecretSync.Zabbix
];

export type LocalSyncConnection = { id: string; name: string; app: string };

export const LOCAL_SYNC_CONNECTIONS: LocalSyncConnection[] = [
  { id: "00000000-0000-4000-9000-000000000001", name: "aws-demo-account", app: "aws" },
  { id: "00000000-0000-4000-9000-000000000002", name: "aws-demo-staging", app: "aws" },
  { id: "00000000-0000-4000-9000-000000000003", name: "github-demo-app", app: "github" },
  { id: "00000000-0000-4000-9000-000000000004", name: "gcp-demo-service-account", app: "gcp" },
  {
    id: "00000000-0000-4000-9000-000000000005",
    name: "azure-key-vault-demo",
    app: "azure-key-vault"
  },
  { id: "00000000-0000-4000-9000-000000000006", name: "vercel-demo-token", app: "vercel" }
];

export const LOCAL_KMS_KEYS: Partial<Record<SecretSync, string[]>> = {
  [SecretSync.AWSParameterStore]: ["alias/aws/ssm", "alias/payments-demo"],
  [SecretSync.AWSSecretsManager]: ["alias/aws/secretsmanager", "alias/payments-demo"]
};

export const LOCAL_GITHUB = {
  organizations: ["acme-demo", "acme-labs-demo"],
  repositories: [
    { id: 1001, name: "payments-api", owner: "acme-demo" },
    { id: 1002, name: "web-dashboard", owner: "acme-demo" },
    { id: 1003, name: "checkout-worker", owner: "acme-labs-demo" }
  ],
  environments: [
    { id: 1, name: "production" },
    { id: 2, name: "staging" }
  ]
};

export const LOCAL_GCP = {
  projects: [
    { id: "acme-payments-demo", name: "Acme payments demo" },
    { id: "acme-platform-demo", name: "Acme platform demo" }
  ],
  locations: [
    { locationId: "us-central1", displayName: "Iowa" },
    { locationId: "us-east1", displayName: "South Carolina" },
    { locationId: "europe-west1", displayName: "Belgium" },
    { locationId: "asia-east1", displayName: "Taiwan" }
  ]
};

export const LOCAL_VERCEL = {
  teams: [
    {
      id: "team_demo_acme",
      name: "Acme demo",
      slug: "acme-demo",
      apps: [
        {
          id: "prj_demo_payments",
          name: "payments-web",
          envs: [{ id: "env_demo_qa", slug: "qa", type: "custom" }],
          previewBranches: ["main", "feature/checkout"]
        },
        { id: "prj_demo_docs", name: "docs-site", envs: [], previewBranches: ["main"] }
      ]
    }
  ]
};

export function seedSyncs(): LocalSecretSync[] {
  return [
    {
      id: "payments-api:dev:/:sync:aws-parameter-store-payments-dev",
      name: "aws-parameter-store-payments-dev",
      destination: SecretSync.AWSParameterStore,
      project: "payments-api",
      environment: "dev",
      path: "/",
      status: SecretSyncStatus.Succeeded,
      autoSync: true,
      lastSyncedAt: "2026-10-24T17:42:00.000Z",
      connectionId: LOCAL_SYNC_CONNECTIONS[0].id,
      connectionName: LOCAL_SYNC_CONNECTIONS[0].name,
      destinationConfig: { region: "us-east-1", path: "/payments/dev/" }
    },
    {
      id: "payments-api:dev:/:sync:github-acme-demo-payments-api-dev",
      name: "github-acme-demo-payments-api-dev",
      destination: SecretSync.GitHub,
      project: "payments-api",
      environment: "dev",
      path: "/",
      status: SecretSyncStatus.Failed,
      autoSync: true,
      lastSyncedAt: "2026-10-25T09:15:00.000Z",
      lastSyncMessage: JSON.stringify({
        message: "Resource not accessible by integration",
        status: 403
      }),
      connectionId: LOCAL_SYNC_CONNECTIONS[2].id,
      connectionName: LOCAL_SYNC_CONNECTIONS[2].name,
      destinationConfig: { scope: "repository", owner: "acme-demo", repo: "payments-api" }
    },
    {
      id: "payments-api:staging:/:sync:vercel-payments-web-preview",
      name: "vercel-payments-web-preview",
      destination: SecretSync.Vercel,
      project: "payments-api",
      environment: "staging",
      path: "/",
      status: SecretSyncStatus.Pending,
      autoSync: true,
      connectionId: LOCAL_SYNC_CONNECTIONS[5].id,
      connectionName: LOCAL_SYNC_CONNECTIONS[5].name,
      destinationConfig: {
        scope: "project",
        app: "prj_demo_payments",
        appName: "payments-web",
        env: "preview",
        teamId: "team_demo_acme",
        sensitive: false
      }
    }
  ];
}
