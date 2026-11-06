import { CloudflareR2Jurisdiction } from "@app/hooks/api/appConnections/cloudflare/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import type { V4QueryResult } from "../contract";
import type { ConnectionWithApp, SecretsOptionsAdapter } from "./contract-options";
import { DEMO_SYNC_CONNECTIONS } from "./demo-syncs";

const ROTATION_CONNECTION_NAMES: [AppConnection, string[]][] = [
  [AppConnection.Postgres, ["payments-postgres", "ledger-postgres"]],
  [AppConnection.MsSql, ["reporting-mssql"]],
  [AppConnection.MySql, ["legacy-mysql"]],
  [AppConnection.OracleDB, ["finance-oracle"]],
  [AppConnection.Auth0, ["payments-auth0"]],
  [AppConnection.AzureClientSecrets, ["payments-entra"]],
  [AppConnection.LDAP, ["corp-ldap"]],
  [AppConnection.AWS, ["aws-production"]],
  [AppConnection.Okta, ["payments-okta"]],
  [AppConnection.Redis, ["cache-redis"]],
  [AppConnection.MongoDB, ["events-mongodb"]],
  [AppConnection.Databricks, ["analytics-databricks"]],
  [AppConnection.SSH, ["bastion-ssh"]],
  [AppConnection.Dbt, ["analytics-dbt"]],
  [AppConnection.SMB, ["billing-windows"]],
  [AppConnection.OpenRouter, ["payments-openrouter"]],
  [AppConnection.LiteLLM, ["internal-litellm"]],
  [AppConnection.OpenAI, ["payments-openai"]],
  [AppConnection.HpeIloRedFish, ["rack-a-ilo"]],
  [AppConnection.Supabase, ["web-supabase"]],
  [AppConnection.Salesforce, ["sales-salesforce"]],
  [AppConnection.Datadog, ["observability-datadog"]],
  [AppConnection.Convex, ["web-convex"]],
  [AppConnection.Fireworks, ["inference-fireworks"]],
  [AppConnection.Snowflake, ["warehouse-snowflake"]],
  [AppConnection.Cloudflare, ["edge-cloudflare"]],
  [AppConnection.Stripe, ["payments-stripe"]],
  [AppConnection.GCP, ["payments-gcp"]]
];

export const DEMO_ROTATION_CONNECTIONS: ConnectionWithApp[] = ROTATION_CONNECTION_NAMES.flatMap(
  ([app, names]) =>
    names.map((name) => ({ id: `connection-${name}`, name, app, projectId: "payments-api" }))
);

const ready = <T>(data: T, enabled = true): V4QueryResult<T> => ({
  data: enabled ? data : undefined,
  isPending: !enabled,
  error: null
});

const listOf =
  <T>(items: T[]) =>
  (_connectionId: string, options?: { enabled?: boolean }) =>
    ready(items, options?.enabled ?? true);

const DEMO_GITHUB_ORGS = [
  { login: "acme-demo", id: 1 },
  { login: "acme-labs-demo", id: 2 }
];

const DEMO_VERCEL_ENVS = [{ id: "env_demo_qa", slug: "qa", type: "custom" }];

export const secretsOptionsDemo: SecretsOptionsAdapter = {
  useAvailableConnections: (apps) => ({
    connections: [...DEMO_ROTATION_CONNECTIONS, ...DEMO_SYNC_CONNECTIONS].filter((connection) =>
      apps.includes(connection.app)
    ),
    isPending: false
  }),
  useGateways: () =>
    ready(
      [
        ["local-gateway-us-east", "us-east-gateway", new Date().toISOString()],
        ["local-gateway-eu-west", "eu-west-gateway", null]
      ].map(([id, name, heartbeat]) => ({
        id: id as string,
        name: name as string,
        identityId: "demo-identity",
        relayId: "demo-relay",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
        heartbeat,
        heartbeatTTL: 60,
        directAddress: null,
        directHeartbeat: null,
        canRevoke: false,
        connectedResourcesCount: 0,
        identity: null
      }))
    ),
  useGatewayPools: () =>
    ready([
      {
        id: "local-pool-primary",
        orgId: "demo",
        name: "primary-pool",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
        memberCount: 2,
        healthyMemberCount: 1,
        memberGatewayIds: ["local-gateway-us-east", "local-gateway-eu-west"],
        connectedResourcesCount: 0
      }
    ]),
  useAwsKmsKeys: ({ destination }, options) =>
    ready(
      [
        destination === SecretSync.AWSParameterStore ? "alias/aws/ssm" : "alias/aws/secretsmanager",
        "alias/payments-demo"
      ].map((alias) => ({ alias, id: alias })),
      options?.enabled ?? true
    ),
  useAwsIamUsers: listOf(
    ["demo-payments-deployer", "demo-ledger-reader"].map((UserName) => ({
      UserName,
      arn: `arn:aws:iam::000000000000:user/${UserName}`
    }))
  ),
  useGitHubOrganizations: listOf(DEMO_GITHUB_ORGS),
  useGitHubRepositories: listOf([
    { id: 1001, name: "payments-api", owner: DEMO_GITHUB_ORGS[0] },
    { id: 1002, name: "web-dashboard", owner: DEMO_GITHUB_ORGS[0] },
    { id: 1003, name: "checkout-worker", owner: DEMO_GITHUB_ORGS[1] }
  ]),
  useGitHubEnvironments: (_dto, options) =>
    ready(
      [
        { id: 1, name: "production" },
        { id: 2, name: "staging" }
      ],
      options?.enabled ?? true
    ),
  useGcpProjects: listOf([
    { id: "acme-payments-demo", name: "Acme payments demo" },
    { id: "acme-platform-demo", name: "Acme platform demo" }
  ]),
  useGcpLocations: (_dto, options) =>
    ready(
      [
        { locationId: "us-central1", displayName: "Iowa" },
        { locationId: "us-east1", displayName: "South Carolina" },
        { locationId: "europe-west1", displayName: "Belgium" },
        { locationId: "asia-east1", displayName: "Taiwan" }
      ],
      options?.enabled ?? true
    ),
  useVercelOrganizations: listOf([
    {
      id: "team_demo_acme",
      name: "Acme demo",
      slug: "acme-demo",
      apps: [
        {
          id: "prj_demo_payments",
          name: "payments-web",
          projectId: "prj_demo_payments",
          envs: DEMO_VERCEL_ENVS,
          previewBranches: ["main", "feature/checkout"]
        },
        {
          id: "prj_demo_docs",
          name: "docs-site",
          projectId: "prj_demo_docs",
          envs: [],
          previewBranches: ["main"]
        }
      ]
    }
  ]),
  useAuth0Clients: listOf([
    { id: "demo-auth0-client-checkout", name: "checkout-web (demo)" },
    { id: "demo-auth0-client-billing", name: "billing-worker (demo)" }
  ]),
  useAzureClients: listOf([
    {
      id: "00000000-demo-4000-8000-0000000000a1",
      name: "payments-api (demo)",
      appId: "demo-app-id-a1"
    },
    {
      id: "00000000-demo-4000-8000-0000000000a2",
      name: "ledger-sync (demo)",
      appId: "demo-app-id-a2"
    }
  ]),
  useOktaApps: listOf([
    { id: "demo0oa1checkout", label: "Checkout portal (demo)" },
    { id: "demo0oa2billing", label: "Billing console (demo)" }
  ]),
  useDatabricksServicePrincipals: listOf([
    { id: "demo-sp-1001", name: "etl-runner (demo)", clientId: "demo-client-1001" },
    { id: "demo-sp-1002", name: "reporting-bot (demo)", clientId: "demo-client-1002" }
  ]),
  useSalesforceOauthApps: listOf([
    { identifier: "demo-0Hx001", developerName: "Payments_Integration_Demo" },
    { identifier: "demo-0Hx002", developerName: "Ledger_Export_Demo" }
  ]),
  useOpenAIProjects: listOf([
    { id: "proj_demo_payments", name: "payments (demo)" },
    { id: "proj_demo_support", name: "support-assistant (demo)" }
  ]),
  useDatadogServiceAccounts: listOf([
    { id: "demo-sa-7f1c", name: "ci-monitoring (demo)" },
    { id: "demo-sa-9b2e", name: "payments-dashboards (demo)" }
  ]),
  useFireworksServiceAccounts: listOf(
    [
      ["accounts/demo/users/inference-bot", "Inference bot (demo)"],
      ["accounts/demo/users/eval-runner", "Eval runner (demo)"]
    ].map(([name, displayName]) => ({
      name,
      displayName,
      role: "user",
      serviceAccount: true,
      state: "ACTIVE"
    }))
  ),
  useDbtProjects: listOf(
    [
      [70001, "demo-analytics"],
      [70002, "demo-marketing-models"],
      [70003, "demo-finance-reporting"]
    ].map(([id, name]) => ({
      id: id as number,
      name: name as string,
      description: "",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z"
    }))
  ),
  useSnowflakeUsers: listOf(
    ["DEMO_ETL_SERVICE", "DEMO_REPORTING_SERVICE", "DEMO_DBT_RUNNER"].map((name) => ({ name }))
  ),
  useSupabaseProjects: listOf([
    { id: "demoprojref0000000001", name: "demo-web-app" },
    { id: "demoprojref0000000002", name: "demo-staging" }
  ]),
  useCloudflareAccountZones: listOf([
    { id: "zone-fake-0001", name: "example-storefront.test" },
    { id: "zone-fake-0002", name: "example-docs.test" },
    { id: "zone-fake-0003", name: "example-status.test" }
  ]),
  useCloudflarePermissionGroups: listOf([
    { id: "pg-fake-0001", name: "Account Settings Read", scopes: ["com.cloudflare.api.account"] },
    { id: "pg-fake-0002", name: "Workers Scripts Write", scopes: ["com.cloudflare.api.account"] },
    { id: "pg-fake-0003", name: "DNS Read", scopes: ["com.cloudflare.api.account.zone"] },
    { id: "pg-fake-0004", name: "DNS Write", scopes: ["com.cloudflare.api.account.zone"] },
    { id: "pg-fake-0005", name: "Cache Purge", scopes: ["com.cloudflare.api.account.zone"] },
    { id: "pg-fake-0006", name: "Zone Read", scopes: [] }
  ]),
  useCloudflareR2Buckets: listOf([
    { name: "example-assets", jurisdiction: CloudflareR2Jurisdiction.Default },
    { name: "example-backups", jurisdiction: CloudflareR2Jurisdiction.Default },
    { name: "example-eu-logs", jurisdiction: CloudflareR2Jurisdiction.Eu },
    { name: "example-gov-archive", jurisdiction: CloudflareR2Jurisdiction.FedRamp }
  ]),
  useLiteLLMUsers: listOf([
    { id: "user-fake-0001", name: "ada@example.test" },
    { id: "user-fake-0002", name: "grace@example.test" },
    { id: "user-fake-0003", name: "linus@example.test" }
  ]),
  useLiteLLMTeams: listOf([
    { id: "team-fake-0001", name: "example-platform" },
    { id: "team-fake-0002", name: "example-research" }
  ]),
  useLiteLLMModels: listOf([
    { id: "example-chat-large", name: "example-chat-large" },
    { id: "example-chat-small", name: "example-chat-small" },
    { id: "example-embed-v1", name: "example-embed-v1" }
  ]),
  useOpenRouterWorkspaces: listOf([
    { id: "ws-fake-0001", name: "Example Production", slug: "example-production" },
    { id: "ws-fake-0002", name: "Example Staging", slug: "example-staging" }
  ]),
  useEntraIdUsers: ({ enabled }) =>
    ready(
      [
        ["3d6b1f2a-7c4e-4a1b-9f0d-2e8c5a7b1d40", "Avery Chen", "avery.chen@example.com"],
        ["8a2e4c6f-1b3d-4f5a-8c7e-9d0b2a4c6e81", "Jordan Patel", "jordan.patel@example.com"],
        ["c5f7a9b1-3d5e-4c7a-9b1d-3f5a7c9e1b22", "Riley Moreno", "riley.moreno@example.com"]
      ].map(([id, name, email]) => ({ id, name, email })),
      enabled
    ),
  useIbmApiConnectOrgs: ({ enabled }) =>
    ready(
      [
        { id: "local-org-acme", name: "acme", title: "Acme Corp" },
        { id: "local-org-sandbox", name: "sandbox", title: "Sandbox" }
      ],
      enabled
    ),
  useIbmApiConnectCatalogs: ({ orgId, enabled }) =>
    ready(
      orgId === "local-org-acme"
        ? [
            { id: "local-catalog-production", name: "production", title: "Production" },
            { id: "local-catalog-staging", name: "staging", title: "Staging" }
          ]
        : [{ id: "local-catalog-sandbox", name: "sandbox", title: "Sandbox" }],
      enabled
    ),
  useIbmApiConnectApps: ({ catalogId, enabled }) =>
    ready(
      (
        {
          "local-catalog-production": [
            ["local-app-payments", "payments", "Payments API Client"],
            ["local-app-mobile", "mobile", "Mobile App"]
          ],
          "local-catalog-staging": [["local-app-qa", "qa", "QA Client"]],
          "local-catalog-sandbox": [["local-app-sandbox", "sandbox", "Sandbox Client"]]
        }[catalogId] ?? []
      ).map(([id, name, title]) => ({
        id,
        name,
        title,
        consumerOrgId: id.replace("local-app-", "local-consumer-org-")
      })),
      enabled
    )
};
