import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import type { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { AzureKeyVaultConnectionMethod } from "@app/hooks/api/appConnections/types/azure-key-vault-connection";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { CloudflareConnectionMethod } from "@app/hooks/api/appConnections/types/cloudflare-connection";
import {
  DatabricksConnectionMethod,
  DatabricksConnectionScope
} from "@app/hooks/api/appConnections/types/databricks-connection";
import { DigiCertConnectionMethod } from "@app/hooks/api/appConnections/types/digicert-connection";
import { F5BigIpConnectionMethod } from "@app/hooks/api/appConnections/types/f5-big-ip-connection";
import { GcpConnectionMethod } from "@app/hooks/api/appConnections/types/gcp-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { GitHubRadarConnectionMethod } from "@app/hooks/api/appConnections/types/github-radar-connection";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";
import { PostgresConnectionMethod } from "@app/hooks/api/appConnections/types/postgres-connection";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import { S3CompatibleConnectionMethod } from "@app/hooks/api/appConnections/types/s3-compatible-connection";
import { VercelConnectionMethod } from "@app/hooks/api/appConnections/types/vercel-connection";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import type { TGitHubApp } from "@app/hooks/api/gitHubApps/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  type WorkflowIntegration,
  WorkflowIntegrationPlatform,
  WorkflowIntegrationStatus
} from "@app/hooks/api/workflowIntegrations/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import { CONNECTION_PRESETS } from "./connection-presets";
import type { IntegrationsAdapter } from "./contract";

const seededOptions: { app: AppConnection; methods: string[]; [key: string]: unknown }[] = [
  { app: AppConnection.AWS, methods: Object.values(AwsConnectionMethod) },
  {
    app: AppConnection.GitHub,
    methods: [GitHubConnectionMethod.App, GitHubConnectionMethod.OAuth, GitHubConnectionMethod.Pat]
  },
  {
    app: AppConnection.GitHubRadar,
    methods: [GitHubRadarConnectionMethod.App],
    appClientSlug: "infisical-radar-demo"
  },
  { app: AppConnection.Bitbucket, methods: [BitbucketConnectionMethod.ApiToken] },
  {
    app: AppConnection.GitLab,
    methods: [GitLabConnectionMethod.AccessToken, GitLabConnectionMethod.OAuth],
    oauthClientId: "infisical-gitlab-demo"
  },
  { app: AppConnection.Vercel, methods: [VercelConnectionMethod.ApiToken] },
  { app: AppConnection.GCP, methods: [GcpConnectionMethod.ServiceAccountImpersonation] },
  {
    app: AppConnection.AzureKeyVault,
    methods: Object.values(AzureKeyVaultConnectionMethod)
  },
  { app: AppConnection.Databricks, methods: [DatabricksConnectionMethod.ServicePrincipal] }
];

const options = [
  ...seededOptions,
  ...Object.values(CONNECTION_PRESETS)
    .filter((preset) => !seededOptions.some((option) => option.app === preset.app))
    .map((preset) => ({
      app: preset.app as AppConnection,
      methods: preset.methods.map((method) => method.value)
    }))
].map((option) => ({ ...option, name: option.app }) as TAppConnectionOption);

const ORG_GITHUB_APP_ID = "9e1b3d5f-7a9c-4e1b-8d3f-5a7c9e1b3d02";

const gitHubApp = (app: Partial<TGitHubApp> & Pick<TGitHubApp, "id" | "name" | "slug">) => ({
  orgId: V4_DEMO_ORG_ID,
  projectId: null,
  appId: "104233",
  clientId: null,
  owner: null,
  host: null,
  instanceType: null,
  connectionCount: 0,
  createdAt: null,
  updatedAt: null,
  ...app
});

const gitHubApps: TGitHubApp[] = [
  gitHubApp({ id: null, name: "Infisical", slug: "infisical-demo", connectionCount: 2 }),
  gitHubApp({
    id: ORG_GITHUB_APP_ID,
    name: "infisical-acme-deploy",
    slug: "infisical-acme-deploy",
    owner: "acme-corp",
    instanceType: "cloud",
    connectionCount: 1,
    createdAt: "2026-04-02T09:00:00Z",
    updatedAt: "2026-04-02T09:00:00Z"
  })
];

const gitHubAppStore = createFixtureStore(gitHubApps);

export const deleteDemoGitHubApp = (id: string) => {
  const removed = gitHubAppStore.get().find((app) => app.id === id) as TGitHubApp;
  gitHubAppStore.update((apps) => apps.filter((app) => app.id !== id));
  return removed;
};

/** What the server sends back for a managed identity connection; the issuer follows SITE_URL. */
const federatedCredential = (connectionId: string) => ({
  issuerUrl: `${window.location.origin}/api/v1/oidc-issuer/organizations/${V4_DEMO_ORG_ID}`,
  subjectIdentifier: `app-connection:${connectionId}`,
  audience: "api://AzureADTokenExchange"
});

/** The API never returns secrets, so the fixtures keep only what a read would show. */
const SECRET_KEY = /secret|password|privatekey|token|certificatebody|code/i;
const readableCredentials = (credentials: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries(credentials).filter(([key]) => !SECRET_KEY.test(key)));

const project = (id: string, type: ProjectType) => ({ id, name: id, slug: id, type });
const days = (count: number) => new Date(Date.now() + count * 86_400_000);
const rotation = (status: AppConnectionCredentialRotationStatus, inDays: number) => ({
  nextRotationAt: days(inDays),
  rotationInterval: 30,
  rotationStatus: status,
  lastRotationMessage:
    status === AppConnectionCredentialRotationStatus.Failed
      ? "The client secret was revoked in Azure."
      : null,
  rotateAtUtc: { hours: 3, minutes: 0 }
});

const connection = (
  id: string,
  app: AppConnection,
  name: string,
  method: string,
  createdAt: string,
  extra: Partial<Omit<TAppConnection, "app" | "method" | "credentials">> = {}
) =>
  ({
    id,
    app,
    name,
    method,
    credentials: {},
    description: null,
    version: 1,
    orgId: V4_DEMO_ORG_ID,
    createdAt,
    updatedAt: createdAt,
    projectId: extra.project?.id ?? null,
    ...extra
  }) as TAppConnection;

const store = createFixtureStore<TAppConnection[]>([
  connection(
    "5b0c2f4e-1a3d-4e6b-9f20-7c8d1e2a3b41",
    AppConnection.AWS,
    "aws-production",
    AwsConnectionMethod.AssumeRole,
    "2025-09-14T10:20:00Z",
    { description: "Production account 4417, used by secret syncs" }
  ),
  connection(
    "a7e3d901-6b2c-4f8a-8d15-3e9f0c4b7a62",
    AppConnection.AWS,
    "aws-staging-keys",
    AwsConnectionMethod.AccessKey,
    "2026-01-08T15:02:00Z",
    {
      isAutoRotationEnabled: true,
      rotation: rotation(AppConnectionCredentialRotationStatus.Success, 27)
    }
  ),
  connection(
    "c19f8b27-3d4e-4a5f-b6c7-0d1e2f3a4b53",
    AppConnection.GitHub,
    "github-acme",
    GitHubConnectionMethod.App,
    "2025-06-02T08:45:00Z"
  ),
  connection(
    "e2d4a6b8-9c0e-4f1a-8b3c-5d7e9f0a1b24",
    AppConnection.GCP,
    "gcp-platform-core",
    GcpConnectionMethod.ServiceAccountImpersonation,
    "2026-03-19T12:10:00Z"
  ),
  connection(
    "f4a6c8e0-2b4d-4f6a-9c8e-0a2b4c6d8e15",
    AppConnection.AzureKeyVault,
    "azure-kv-eu-west",
    AzureKeyVaultConnectionMethod.ClientSecret,
    "2025-12-11T09:30:00Z",
    {
      isAutoRotationEnabled: true,
      rotation: rotation(AppConnectionCredentialRotationStatus.Failed, 1)
    }
  ),
  connection(
    "0b2d4f6a-8c0e-4a2b-8d4f-6a8c0e2b4d96",
    AppConnection.Databricks,
    "databricks-analytics",
    DatabricksConnectionMethod.ServicePrincipal,
    "2026-05-27T17:40:00Z",
    {
      credentials: {
        workspaceUrl: "https://dbc-4f2a91c7-8e3b.cloud.databricks.com",
        clientId: "6f1c2a9e-4b7d-4e3a-9c5f-2d8b1e7a4c60",
        scopes: [DatabricksConnectionScope.Secrets]
      }
    } as Partial<TAppConnection>
  ),
  connection(
    "1c3e5a7b-9d1f-4b3d-a5e7-9b1d3f5a7c87",
    AppConnection.Vercel,
    "vercel-web-dashboard",
    VercelConnectionMethod.ApiToken,
    "2026-02-03T11:15:00Z",
    { project: project("web-dashboard", ProjectType.SecretManager) }
  ),
  connection(
    "2d4f6b8c-0e2a-4c4e-b6f8-0c2e4a6b8d78",
    AppConnection.GitHub,
    "github-ci-readonly",
    GitHubConnectionMethod.OAuth,
    "2026-04-22T14:05:00Z",
    { project: project("platform-core", ProjectType.SecretManager) }
  ),
  connection(
    "3e5a7c9d-1f3b-4d5f-a7c9-1d3f5b7d9e69",
    AppConnection.AWS,
    "aws-route53-pki",
    AwsConnectionMethod.AssumeRole,
    "2026-07-30T16:50:00Z",
    {
      description: "DNS validation for ACME issuance",
      project: project("internal-pki", ProjectType.CertificateManager)
    }
  ),
  connection(
    "4f6b8d0e-2a4c-4e6a-8b0d-2f4a6c8e0b51",
    AppConnection.AWS,
    "payments-secrets-manager",
    AwsConnectionMethod.AccessKey,
    "2026-06-11T09:12:00Z",
    {
      description: "Syncs payment secrets to AWS Secrets Manager in us-east-1",
      credentials: { accessKeyId: "AKIA4PAYMENTS7EXAMPLE" },
      isAutoRotationEnabled: true,
      rotation: rotation(AppConnectionCredentialRotationStatus.Success, 4),
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "5a7c9e1b-3d5f-4b7d-9e1a-3c5e7a9b1d42",
    AppConnection.GitHub,
    "payments-github-actions",
    GitHubConnectionMethod.Pat,
    "2026-07-02T13:40:00Z",
    {
      credentials: { instanceType: "cloud" },
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "6b8d0f2c-4e6a-4c8e-a0f2-4d6f8b0c2e33",
    AppConnection.Postgres,
    "payments-ledger-db",
    PostgresConnectionMethod.UsernameAndPassword,
    "2026-08-19T08:05:00Z",
    {
      credentials: {
        host: "ledger.payments.internal",
        port: 5432,
        database: "ledger",
        username: "infisical_rotator",
        sslEnabled: true,
        sslRejectUnauthorized: true
      },
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "7c9e1a3d-5f7b-4d9f-b1a3-5e7a9c1d3f24",
    AppConnection.GitLab,
    "payments-gitlab",
    GitLabConnectionMethod.OAuth,
    "2026-09-27T16:22:00Z",
    { project: project("payments-api", ProjectType.SecretManager) }
  ),
  connection(
    "8d0f2b4e-6a8c-4e0a-82b4-6f8b0d2e4a15",
    AppConnection.AzureKeyVault,
    "payments-key-vault",
    AzureKeyVaultConnectionMethod.ClientSecret,
    "2026-10-08T10:48:00Z",
    {
      isPlatformManagedCredentials: true,
      isAutoRotationEnabled: false,
      rotation: rotation(AppConnectionCredentialRotationStatus.Success, 18),
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "9e1b3d5f-7a9c-4e1b-8d3f-5a7c9e1b3d16",
    AppConnection.AzureKeyVault,
    "payments-kv-managed-identity",
    AzureKeyVaultConnectionMethod.ManagedIdentity,
    "2026-10-21T15:30:00Z",
    {
      credentials: {
        tenantId: "8b1e4c7a-2d5f-4a9e-b3c6-1f7d9e2a5b48",
        clientId: "3c6f9a2d-5e8b-4c1f-a7d4-0b3e6f9c2a51",
        federatedCredential: federatedCredential("9e1b3d5f-7a9c-4e1b-8d3f-5a7c9e1b3d16")
      },
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "0f2c4e6a-8b0d-4f2c-9e4a-6b8d0f2c4e07",
    AppConnection.GitHub,
    "payments-github-deploy",
    GitHubConnectionMethod.App,
    "2026-10-29T11:05:00Z",
    {
      credentials: { gitHubAppId: ORG_GITHUB_APP_ID, instanceType: "cloud" },
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "1a3c5e7b-9d0f-4a3c-8e5b-7d9f1a3c5e98",
    AppConnection.S3Compatible,
    "payments-minio-archive",
    S3CompatibleConnectionMethod.AccessKey,
    "2026-11-03T08:40:00Z",
    {
      credentials: {
        endpoint: "https://minio.acme.internal",
        accessKeyId: "payments-archive",
        region: "eu-central-1"
      },
      project: project("payments-api", ProjectType.SecretManager)
    } as Partial<TAppConnection>
  ),
  connection(
    "a1c3e5f7-0b2d-4f4a-9c6e-8a0c2e4f6b98",
    AppConnection.GitHubRadar,
    "github-radar-acme",
    GitHubRadarConnectionMethod.App,
    "2026-05-14T09:20:00Z",
    {
      description: "Scans every repository in the acme-corp organization",
      project: project("secret-scanning", ProjectType.SecretScanning)
    }
  ),
  connection(
    "b2d4f6a8-1c3e-4a5b-8d7f-9b1d3f5a7c89",
    AppConnection.Bitbucket,
    "bitbucket-mobile-workspace",
    BitbucketConnectionMethod.ApiToken,
    "2026-08-03T14:55:00Z",
    { project: project("secret-scanning", ProjectType.SecretScanning) }
  ),
  connection(
    "c3e5a7b9-2d4f-4b6c-9e8a-0c2e4a6b8d7a",
    AppConnection.GitLab,
    "gitlab-platform-group",
    GitLabConnectionMethod.AccessToken,
    "2026-09-09T07:35:00Z",
    { project: project("secret-scanning", ProjectType.SecretScanning) }
  ),
  connection(
    "d4f6b8c0-3e5a-4c7d-8f9b-1d3f5b7c9e6b",
    AppConnection.Cloudflare,
    "cloudflare-dns-validation",
    CloudflareConnectionMethod.ApiToken,
    "2026-05-02T11:05:00Z",
    { project: project("internal-pki", ProjectType.CertificateManager) }
  ),
  connection(
    "e5a7c9d1-4f6b-4d8e-9a0c-2e4a6c8d0f5c",
    AppConnection.DigiCert,
    "digicert-public-tls",
    DigiCertConnectionMethod.ApiKey,
    "2026-01-21T08:30:00Z",
    {
      description: "Public TLS certificates for customer facing domains",
      project: project("internal-pki", ProjectType.CertificateManager)
    }
  ),
  connection(
    "f6b8d0e2-5a7c-4e9f-8b1d-3f5b7d9e1a4d",
    AppConnection.F5BigIp,
    "f5-lb-prod",
    F5BigIpConnectionMethod.BasicAuth,
    "2026-08-11T17:25:00Z",
    {
      isPlatformManagedCredentials: true,
      project: project("internal-pki", ProjectType.CertificateManager)
    }
  )
]);

type DemoWorkflowIntegration = WorkflowIntegration & { teamName?: string; tenantId?: string };

const workflowStore = createFixtureStore<DemoWorkflowIntegration[]>([
  {
    id: "4d7e1a2b-6c3f-4e8a-9b1d-2f5c8e0a3b61",
    slug: "platform-alerts",
    description: "Access requests and secret sync failures for the platform team",
    status: WorkflowIntegrationStatus.Installed,
    integration: WorkflowIntegrationPlatform.SLACK,
    teamName: "Acme Corp"
  },
  {
    id: "8a2c5e7f-1b4d-4f6a-8c0e-3d5f7a9b1c22",
    slug: "security-approvals",
    description: "",
    status: WorkflowIntegrationStatus.Installed,
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
    tenantId: "6f1d3b5a-7c9e-4a2b-8d4f-0e2a4c6e8b13"
  },
  {
    id: "c3e5a7b9-2d4f-4b6c-9e1a-5f7b9d1e3a44",
    slug: "finance-ops-approvals-and-access-requests-eu-central",
    description: "Pending reinstall after the workspace moved to Enterprise Grid",
    status: WorkflowIntegrationStatus.Pending,
    integration: WorkflowIntegrationPlatform.SLACK,
    teamName: "Acme Finance (EU)"
  }
]);

const findWorkflow = (id?: string) => workflowStore.use().find((entry) => entry.id === id);

const renameWorkflow = ({
  id,
  slug,
  description
}: {
  id: string;
  slug?: string;
  description?: string;
}) => {
  workflowStore.update((entries) =>
    entries.map((entry) =>
      entry.id === id
        ? { ...entry, slug: slug ?? entry.slug, description: description ?? entry.description }
        : entry
    )
  );
  return {};
};

const removeWorkflow = ({ id }: { id: string }) => {
  workflowStore.update((entries) => entries.filter((entry) => entry.id !== id));
  return {};
};

const migrationGateways = [
  { id: "3f9a2c71-8e4b-4d15-a6c0-5b7e1d2f8a93", name: "prod-us-east" },
  { id: "b81d4e06-2c9f-47a3-9e5b-0f6a3c8d1e27", name: "prod-eu-west" }
].map(({ id, name }): TGatewayV2 => ({
  id,
  name,
  identityId: null,
  relayId: null,
  createdAt: "2026-09-12T10:00:00Z",
  updatedAt: "2026-09-12T10:00:00Z",
  heartbeat: new Date().toISOString(),
  heartbeatTTL: 180,
  directAddress: null,
  directHeartbeat: null,
  canRevoke: true,
  connectedResourcesCount: 0,
  identity: null
}));

export const demoConnections = () => store.get();

export const integrationsDemo: IntegrationsAdapter = {
  useConnections: (projectId) => ({
    data: store.use().filter((entry) => !projectId || entry.projectId === projectId),
    isPending: false,
    error: null
  }),
  useConnectionOptions: () => ({ data: options, isPending: false, error: null }),
  useCreateConnection: fixtureMutation((input) => {
    const id = crypto.randomUUID();
    const { isAutoRotationEnabled, rotation: schedule } = input as typeof input & {
      isAutoRotationEnabled?: boolean;
      rotation?: { rotationInterval: number; rotateAtUtc: { hours: number; minutes: number } };
    };
    const created = connection(id, input.app, input.name, input.method, new Date().toISOString(), {
      description: input.description ?? null,
      credentials: {
        ...readableCredentials(input.credentials as Record<string, unknown>),
        ...(input.method === AzureKeyVaultConnectionMethod.ManagedIdentity && {
          federatedCredential: federatedCredential(id)
        })
      },
      ...(isAutoRotationEnabled &&
        schedule && {
          isAutoRotationEnabled,
          rotation: {
            ...rotation(AppConnectionCredentialRotationStatus.Success, schedule.rotationInterval),
            ...schedule
          }
        }),
      ...(input.projectId && {
        project:
          store.get().find((entry) => entry.project?.id === input.projectId)?.project ??
          project(input.projectId, ProjectType.SecretManager)
      })
    } as Partial<TAppConnection>);
    store.update((entries) => [...entries, created]);
    return created;
  }),
  useUpdateConnection: fixtureMutation(
    ({ connectionId, credentials: next, rotation: schedule, ...changes }) => {
      const credentials = next && readableCredentials(next as Record<string, unknown>);
      store.update((entries) =>
        entries.map((entry) =>
          entry.id === connectionId
            ? ({
                ...entry,
                ...changes,
                credentials: credentials
                  ? { ...entry.credentials, ...credentials }
                  : entry.credentials,
                ...(schedule && {
                  rotation: {
                    ...(entry.rotation ??
                      rotation(
                        AppConnectionCredentialRotationStatus.Success,
                        schedule.rotationInterval ?? 30
                      )),
                    ...schedule
                  }
                }),
                updatedAt: new Date().toISOString()
              } as TAppConnection)
            : entry
        )
      );
      return store.get().find((entry) => entry.id === connectionId) as TAppConnection;
    }
  ),
  useRotateCredentials: fixtureMutation(({ connectionId }) => {
    store.update((entries) =>
      entries.map((entry) =>
        entry.id === connectionId
          ? {
              ...entry,
              rotation: rotation(AppConnectionCredentialRotationStatus.Success, 30)
            }
          : entry
      )
    );
    return store.get().find((entry) => entry.id === connectionId) as TAppConnection;
  }),
  useDeleteConnection: fixtureMutation(({ connectionId }) => {
    const removed = store.get().find((entry) => entry.id === connectionId) as TAppConnection;
    store.update((entries) => entries.filter((entry) => entry.id !== connectionId));
    return removed;
  }),
  useGitHubApps: () => ({ data: gitHubAppStore.use(), isPending: false, error: null }),
  useWorkflowIntegrations: () => ({ data: workflowStore.use(), isPending: false, error: null }),
  useSlackIntegration: (id) => {
    const entry = findWorkflow(id);
    return {
      data: entry && {
        id: entry.id,
        slug: entry.slug,
        description: entry.description,
        teamName: entry.teamName ?? ""
      },
      isPending: false,
      error: null
    };
  },
  useMicrosoftTeamsIntegration: (id) => {
    const entry = findWorkflow(id);
    return {
      data: entry && {
        id: entry.id,
        slug: entry.slug,
        description: entry.description,
        tenantId: entry.tenantId ?? ""
      },
      isPending: false,
      error: null
    };
  },
  useMicrosoftTeamsClientId: () => ({
    data: { clientId: "demo-not-a-real-client-id" },
    isPending: false,
    error: null
  }),
  fetchSlackInstallUrl: async ({ slug, description }) => {
    workflowStore.update((entries) => [
      ...entries,
      {
        id: crypto.randomUUID(),
        slug,
        description: description ?? "",
        status: WorkflowIntegrationStatus.Installed,
        integration: WorkflowIntegrationPlatform.SLACK,
        teamName: "Acme Corp"
      }
    ]);
    return "";
  },
  fetchSlackReinstallUrl: async ({ id }) => {
    workflowStore.update((entries) =>
      entries.map((entry) =>
        entry.id === id ? { ...entry, status: WorkflowIntegrationStatus.Installed } : entry
      )
    );
    return "";
  },
  useUpdateSlackIntegration: fixtureMutation(renameWorkflow),
  useUpdateMicrosoftTeamsIntegration: fixtureMutation(renameWorkflow),
  useCreateMicrosoftTeamsIntegration: fixtureMutation(({ slug, description, tenantId }) => {
    workflowStore.update((entries) => [
      ...entries,
      {
        id: crypto.randomUUID(),
        slug,
        description: description ?? "",
        status: WorkflowIntegrationStatus.Pending,
        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
        tenantId
      }
    ]);
    return {};
  }),
  useDeleteSlackIntegration: fixtureMutation(removeWorkflow),
  useDeleteMicrosoftTeamsIntegration: fixtureMutation(removeWorkflow),
  useCheckMicrosoftTeamsInstallation: fixtureMutation(({ workflowIntegrationId }) => {
    workflowStore.update((entries) =>
      entries.map((entry) =>
        entry.id === workflowIntegrationId
          ? { ...entry, status: WorkflowIntegrationStatus.Installed }
          : entry
      )
    );
    return {};
  }),
  useIsOrgAdmin: () => ({ data: true, isPending: false, error: null }),
  useMigrationGateways: () => ({ data: migrationGateways, isPending: false, error: null }),
  useCustomMigrationAvailable: () => ({
    data: { data: { enabled: false } },
    isPending: false,
    error: null
  }),
  useImportEnvKey: fixtureMutation(() => undefined),
  useImportVault: fixtureMutation(() => undefined)
};
