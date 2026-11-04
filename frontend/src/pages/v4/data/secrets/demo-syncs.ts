import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { SecretSync, SecretSyncStatus } from "@app/hooks/api/secretSyncs/enums";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";

export const DEMO_SYNC_CONNECTIONS: (TAvailableAppConnection & { app: AppConnection })[] = [
  { id: "00000000-0000-4000-9000-000000000001", name: "aws-demo-account", app: AppConnection.AWS },
  { id: "00000000-0000-4000-9000-000000000002", name: "aws-demo-staging", app: AppConnection.AWS },
  {
    id: "00000000-0000-4000-9000-000000000003",
    name: "github-demo-app",
    app: AppConnection.GitHub
  },
  {
    id: "00000000-0000-4000-9000-000000000004",
    name: "gcp-demo-service-account",
    app: AppConnection.GCP
  },
  {
    id: "00000000-0000-4000-9000-000000000005",
    name: "azure-key-vault-demo",
    app: AppConnection.AzureKeyVault
  },
  {
    id: "00000000-0000-4000-9000-000000000006",
    name: "vercel-demo-token",
    app: AppConnection.Vercel
  }
].map((connection) => ({ ...connection, projectId: "payments-api" }));

export const demoSync = (input: {
  name: string;
  description?: string | null;
  destination: SecretSync;
  connectionId: string;
  environment: { id: string; name: string; slug: string };
  path: string;
  status: SecretSyncStatus | null;
  isAutoSyncEnabled: boolean;
  lastSyncedAt?: string;
  lastSyncMessage?: string;
  destinationConfig: unknown;
  syncOptions?: unknown;
}): TSecretSync => {
  const connection = DEMO_SYNC_CONNECTIONS.find((entry) => entry.id === input.connectionId);
  return {
    id: `sync-${input.name}`,
    name: input.name,
    description: input.description ?? null,
    version: 1,
    folderId: null,
    connectionId: input.connectionId,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    isAutoSyncEnabled: input.isAutoSyncEnabled,
    projectId: "payments-api",
    syncStatus: input.status,
    lastSyncJobId: null,
    lastSyncedAt: input.lastSyncedAt ? new Date(input.lastSyncedAt) : null,
    lastSyncMessage: input.lastSyncMessage ?? null,
    importStatus: null,
    lastImportJobId: null,
    lastImportedAt: null,
    lastImportMessage: null,
    removeStatus: null,
    lastRemoveJobId: null,
    lastRemovedAt: null,
    lastRemoveMessage: null,
    syncOptions: (input.syncOptions ?? {}) as TSecretSync["syncOptions"],
    connection: {
      app: connection?.app ?? AppConnection.AWS,
      id: input.connectionId,
      name: connection?.name ?? input.connectionId
    },
    environment: input.environment,
    folder: { id: input.path, path: input.path },
    destination: input.destination,
    destinationConfig: input.destinationConfig
  } as TSecretSync;
};

export const seedSecretSyncs = (
  envOf: (slug: string) => { id: string; name: string; slug: string }
): TSecretSync[] => [
  demoSync({
    name: "aws-parameter-store-payments-dev",
    destination: SecretSync.AWSParameterStore,
    connectionId: DEMO_SYNC_CONNECTIONS[0].id,
    environment: envOf("dev"),
    path: "/",
    status: SecretSyncStatus.Succeeded,
    isAutoSyncEnabled: true,
    lastSyncedAt: "2026-10-24T17:42:00.000Z",
    destinationConfig: { region: "us-east-1", path: "/payments/dev/" }
  }),
  demoSync({
    name: "github-acme-demo-payments-api-dev",
    destination: SecretSync.GitHub,
    connectionId: DEMO_SYNC_CONNECTIONS[2].id,
    environment: envOf("dev"),
    path: "/",
    status: SecretSyncStatus.Failed,
    isAutoSyncEnabled: true,
    lastSyncedAt: "2026-10-25T09:15:00.000Z",
    lastSyncMessage: JSON.stringify({
      message: "Resource not accessible by integration",
      status: 403
    }),
    destinationConfig: { scope: "repository", owner: "acme-demo", repo: "payments-api" }
  }),
  demoSync({
    name: "vercel-payments-web-preview",
    destination: SecretSync.Vercel,
    connectionId: DEMO_SYNC_CONNECTIONS[5].id,
    environment: envOf("staging"),
    path: "/",
    status: SecretSyncStatus.Pending,
    isAutoSyncEnabled: true,
    destinationConfig: {
      scope: "project",
      app: "prj_demo_payments",
      appName: "payments-web",
      env: "preview",
      teamId: "team_demo_acme",
      sensitive: false
    }
  })
];
