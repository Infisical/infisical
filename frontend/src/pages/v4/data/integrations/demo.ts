import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import type { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { AzureKeyVaultConnectionMethod } from "@app/hooks/api/appConnections/types/azure-key-vault-connection";
import { DatabricksConnectionMethod } from "@app/hooks/api/appConnections/types/databricks-connection";
import { GcpConnectionMethod } from "@app/hooks/api/appConnections/types/gcp-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { GitHubRadarConnectionMethod } from "@app/hooks/api/appConnections/types/github-radar-connection";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import { VercelConnectionMethod } from "@app/hooks/api/appConnections/types/vercel-connection";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { WorkflowIntegration } from "@app/hooks/api/workflowIntegrations/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { IntegrationsAdapter } from "./contract";

const options = [
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
  { app: AppConnection.Vercel, methods: [VercelConnectionMethod.ApiToken] },
  { app: AppConnection.GCP, methods: [GcpConnectionMethod.ServiceAccountImpersonation] },
  {
    app: AppConnection.AzureKeyVault,
    methods: [AzureKeyVaultConnectionMethod.OAuth, AzureKeyVaultConnectionMethod.ClientSecret]
  },
  { app: AppConnection.Databricks, methods: [DatabricksConnectionMethod.ServicePrincipal] }
].map((option) => ({ ...option, name: option.app }) as TAppConnectionOption);

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
    "2026-05-27T17:40:00Z"
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
  )
]);

const workflowIntegrations: WorkflowIntegration[] = [];

export const demoConnections = () => store.get();

export const integrationsDemo: IntegrationsAdapter = {
  useConnections: (projectId) => ({
    data: store.use().filter((entry) => !projectId || entry.projectId === projectId),
    isPending: false,
    error: null
  }),
  useConnectionOptions: () => ({ data: options, isPending: false, error: null }),
  useCreateConnection: fixtureMutation((input) => {
    const created = connection(
      crypto.randomUUID(),
      input.app,
      input.name,
      input.method,
      new Date().toISOString(),
      { description: input.description ?? null }
    );
    store.update((entries) => [...entries, created]);
    return created;
  }),
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
  useWorkflowIntegrations: () => ({ data: workflowIntegrations, isPending: false, error: null })
};
