import type { SyncHostingLookups } from "./contract-sync-hosting";
import { listOf, ready } from "./demo-options";

const DEMO_NETLIFY_SITES: Record<string, { id: string; name: string }[]> = {
  "netlify-account-acme-demo": [
    { id: "netlify-site-acme-demo-marketing", name: "acme-demo-marketing" },
    { id: "netlify-site-acme-demo-docs", name: "acme-demo-docs" }
  ],
  "netlify-account-acme-labs-demo": [
    { id: "netlify-site-acme-labs-demo-playground", name: "acme-labs-demo-playground" }
  ]
};

const DEMO_FORGE_SERVERS: Record<string, { id: string; name: string }[]> = {
  "acme-demo": [
    { id: "forge-server-acme-demo-web", name: "acme-demo-web-1" },
    { id: "forge-server-acme-demo-worker", name: "acme-demo-worker-1" }
  ],
  "acme-labs-demo": [{ id: "forge-server-acme-labs-demo", name: "acme-labs-demo-1" }]
};

const DEMO_FORGE_SITES: Record<string, { id: string; name: string }[]> = {
  "forge-server-acme-demo-web": [
    { id: "forge-site-acme-demo-app", name: "app.acme-demo.example" },
    { id: "forge-site-acme-demo-admin", name: "admin.acme-demo.example" }
  ],
  "forge-server-acme-demo-worker": [
    { id: "forge-site-acme-demo-queue", name: "queue.acme-demo.example" }
  ],
  "forge-server-acme-labs-demo": [
    { id: "forge-site-acme-labs-demo", name: "labs.acme-demo.example" }
  ]
};

export const syncHostingDemo: SyncHostingLookups = {
  useHerokuApps: listOf([
    { id: "heroku-app-acme-demo-api", name: "acme-demo-api" },
    { id: "heroku-app-acme-demo-web", name: "acme-demo-web" }
  ]),
  useNetlifyAccounts: listOf([
    { id: "netlify-account-acme-demo", name: "Acme demo" },
    { id: "netlify-account-acme-labs-demo", name: "Acme labs demo" }
  ]),
  useNetlifySites: ({ accountId }, options) =>
    ready(DEMO_NETLIFY_SITES[accountId] ?? [], options?.enabled ?? true),
  useRenderServices: listOf([
    { id: "srv-acme-demo-api", name: "acme-demo-api" },
    { id: "srv-acme-demo-worker", name: "acme-demo-worker" }
  ]),
  useRenderEnvironmentGroups: listOf([
    { id: "evg-acme-demo-shared", name: "acme-demo-shared" },
    { id: "evg-acme-demo-staging", name: "acme-demo-staging" }
  ]),
  useRailwayProjects: listOf([
    {
      id: "railway-project-acme-demo",
      name: "acme-demo",
      environments: [
        { id: "railway-env-acme-demo-production", name: "production" },
        { id: "railway-env-acme-demo-staging", name: "staging" }
      ],
      services: [
        { id: "railway-service-acme-demo-api", name: "api" },
        { id: "railway-service-acme-demo-web", name: "web" }
      ]
    },
    {
      id: "railway-project-acme-labs-demo",
      name: "acme-labs-demo",
      environments: [{ id: "railway-env-acme-labs-demo-production", name: "production" }],
      services: []
    }
  ]),
  useFlyioApps: listOf([
    { id: "acme-demo-api", name: "acme-demo-api" },
    { id: "acme-demo-edge", name: "acme-demo-edge" }
  ]),
  useCloud66Stacks: listOf([
    { id: "cloud66-stack-acme-demo-web", name: "acme-demo-web" },
    { id: "cloud66-stack-acme-demo-api", name: "acme-demo-api" }
  ]),
  useLaravelForgeOrganizations: listOf([
    { id: "forge-org-acme-demo", name: "Acme demo", slug: "acme-demo" },
    { id: "forge-org-acme-labs-demo", name: "Acme labs demo", slug: "acme-labs-demo" }
  ]),
  useLaravelForgeServers: ({ organizationSlug }, options) =>
    ready(DEMO_FORGE_SERVERS[organizationSlug] ?? [], options?.enabled ?? true),
  useLaravelForgeSites: ({ serverId }, options) =>
    ready(DEMO_FORGE_SITES[serverId] ?? [], options?.enabled ?? true),
  usePortainerEnvironments: listOf([
    { id: 1, name: "acme-demo-production" },
    { id: 2, name: "acme-demo-staging" }
  ]),
  usePortainerStacks: listOf([
    { id: 11, name: "acme-demo-api", environmentId: 1, isGitBased: true },
    { id: 12, name: "acme-demo-worker", environmentId: 1, isGitBased: false },
    { id: 21, name: "acme-demo-staging-web", environmentId: 2, isGitBased: false }
  ])
};
