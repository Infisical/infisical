import type { TOctopusDeployScopeValues } from "@app/hooks/api/appConnections/octopus-deploy/types";

import type { SyncDeployLookups } from "./contract-sync-deploy";
import { listOf, ready } from "./demo-options";

const DEMO_OCTOPUS_PROJECTS: Record<string, { id: string; name: string; slug: string }[]> = {
  "Spaces-101": [
    { id: "Projects-101", name: "Acme demo web", slug: "acme-demo-web" },
    { id: "Projects-102", name: "Acme demo payments", slug: "acme-demo-payments" }
  ],
  "Spaces-102": [{ id: "Projects-201", name: "Acme demo labs", slug: "acme-demo-labs" }]
};

const DEMO_OCTOPUS_SCOPE_VALUES: TOctopusDeployScopeValues = {
  environments: [
    { id: "Environments-101", name: "Development (demo)" },
    { id: "Environments-102", name: "Staging (demo)" },
    { id: "Environments-103", name: "Production (demo)" }
  ],
  roles: [
    { id: "web-demo", name: "web-demo" },
    { id: "worker-demo", name: "worker-demo" }
  ],
  machines: [
    { id: "Machines-101", name: "acme-demo-web-01" },
    { id: "Machines-102", name: "acme-demo-web-02" }
  ],
  processes: [
    { id: "Processes-101", name: "Deploy web (demo)" },
    { id: "Processes-102", name: "Run migrations (demo)" }
  ],
  actions: [
    { id: "Actions-101", name: "Deploy package (demo)" },
    { id: "Actions-102", name: "Smoke test (demo)" }
  ],
  channels: [
    { id: "Channels-101", name: "Default (demo)" },
    { id: "Channels-102", name: "Hotfix (demo)" }
  ]
};

const DEMO_NORTHFLANK_SECRET_GROUPS: Record<string, { id: string; name: string }[]> = {
  "acme-demo-platform": [
    { id: "acme-demo-runtime", name: "acme-demo-runtime" },
    { id: "acme-demo-build", name: "acme-demo-build" }
  ],
  "acme-demo-labs": [{ id: "acme-demo-sandbox", name: "acme-demo-sandbox" }]
};

const DEMO_QOVERY_PROJECTS: Record<string, { id: string; name: string }[]> = {
  "00000000-0000-4000-8000-0000000a0001": [
    { id: "00000000-0000-4000-8000-0000000b0001", name: "acme-demo-storefront" },
    { id: "00000000-0000-4000-8000-0000000b0002", name: "acme-demo-backoffice" }
  ],
  "00000000-0000-4000-8000-0000000a0002": [
    { id: "00000000-0000-4000-8000-0000000b0003", name: "acme-demo-experiments" }
  ]
};

const DEMO_QOVERY_ENVIRONMENTS: Record<string, { id: string; name: string }[]> = {
  "00000000-0000-4000-8000-0000000b0001": [
    { id: "00000000-0000-4000-8000-0000000c0001", name: "production" },
    { id: "00000000-0000-4000-8000-0000000c0002", name: "staging" }
  ],
  "00000000-0000-4000-8000-0000000b0002": [
    { id: "00000000-0000-4000-8000-0000000c0003", name: "production" }
  ],
  "00000000-0000-4000-8000-0000000b0003": [
    { id: "00000000-0000-4000-8000-0000000c0004", name: "preview" }
  ]
};

export const syncDeployDemo: SyncDeployLookups = {
  useTerraformCloudOrganizations: listOf([
    {
      id: "acme-demo",
      name: "acme-demo",
      variableSets: [
        { id: "varset-demoAAAA0001", name: "acme-demo-shared" },
        { id: "varset-demoAAAA0002", name: "acme-demo-aws-credentials" }
      ],
      workspaces: [
        { id: "ws-demoAAAA0001", name: "acme-demo-network" },
        { id: "ws-demoAAAA0002", name: "acme-demo-payments" }
      ]
    },
    {
      id: "acme-labs-demo",
      name: "acme-labs-demo",
      variableSets: [{ id: "varset-demoBBBB0001", name: "acme-labs-demo-shared" }],
      workspaces: [{ id: "ws-demoBBBB0001", name: "acme-labs-demo-sandbox" }]
    }
  ]),
  useOctopusDeploySpaces: listOf([
    { id: "Spaces-101", name: "Acme demo", slug: "acme-demo", isDefault: true },
    { id: "Spaces-102", name: "Acme labs demo", slug: "acme-labs-demo", isDefault: false }
  ]),
  useOctopusDeployProjects: ({ spaceId }, options) =>
    ready(DEMO_OCTOPUS_PROJECTS[spaceId] ?? [], options?.enabled ?? true),
  useOctopusDeployScopeValues: (_dto, options) =>
    ready(DEMO_OCTOPUS_SCOPE_VALUES, options?.enabled ?? true),
  useSpaceliftContexts: listOf([
    { id: "acme-demo-shared-context", name: "acme-demo-shared" },
    { id: "acme-demo-production-context", name: "acme-demo-production" },
    { id: "acme-demo-staging-context", name: "acme-demo-staging" }
  ]),
  useHumanitecOrganizations: listOf([
    {
      id: "acme-demo",
      name: "Acme demo",
      apps: [
        {
          id: "acme-demo-web",
          name: "Acme demo web",
          envs: [
            { id: "development", name: "Development" },
            { id: "staging", name: "Staging" },
            { id: "production", name: "Production" }
          ]
        },
        {
          id: "acme-demo-api",
          name: "Acme demo API",
          envs: [
            { id: "development", name: "Development" },
            { id: "production", name: "Production" }
          ]
        }
      ]
    },
    {
      id: "acme-labs-demo",
      name: "Acme labs demo",
      apps: [
        {
          id: "acme-labs-demo-sandbox",
          name: "Acme labs demo sandbox",
          envs: [{ id: "sandbox", name: "Sandbox" }]
        }
      ]
    }
  ]),
  useNorthflankProjects: listOf([
    { id: "acme-demo-platform", name: "Acme demo platform" },
    { id: "acme-demo-labs", name: "Acme demo labs" }
  ]),
  useNorthflankSecretGroups: ({ projectId }, options) =>
    ready(DEMO_NORTHFLANK_SECRET_GROUPS[projectId] ?? [], options?.enabled ?? true),
  useQoveryOrganizations: listOf([
    { id: "00000000-0000-4000-8000-0000000a0001", name: "acme-demo" },
    { id: "00000000-0000-4000-8000-0000000a0002", name: "acme-labs-demo" }
  ]),
  useQoveryProjects: ({ organizationId }, options) =>
    ready(DEMO_QOVERY_PROJECTS[organizationId] ?? [], options?.enabled ?? true),
  useQoveryEnvironments: ({ projectId }, options) =>
    ready(DEMO_QOVERY_ENVIRONMENTS[projectId] ?? [], options?.enabled ?? true)
};
