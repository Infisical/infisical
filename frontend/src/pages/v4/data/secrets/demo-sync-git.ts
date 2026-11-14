import type { TBitbucketRepo } from "@app/hooks/api/appConnections/bitbucket/types";

import type { SyncGitLookups } from "./contract-sync-git";
import { listOf, ready } from "./demo-options";

const matches = (search: string | undefined, ...values: string[]) =>
  !search || values.some((value) => value.toLowerCase().includes(search.toLowerCase()));

const DEMO_GITLAB_PROJECTS = [
  { id: "90000001", name: "acme-demo/payments-api" },
  { id: "90000002", name: "acme-demo/web-app" },
  { id: "90000003", name: "acme-demo/platform/infrastructure" },
  { id: "90000004", name: "acme-labs-demo/experiments" }
];

const DEMO_GITLAB_GROUPS = [
  {
    id: "80000001",
    name: "acme-demo",
    fullName: "acme-demo",
    fullPath: "acme-demo"
  },
  {
    id: "80000002",
    name: "platform",
    fullName: "acme-demo / platform",
    fullPath: "acme-demo/platform"
  },
  {
    id: "80000003",
    name: "acme-labs-demo",
    fullName: "acme-labs-demo",
    fullPath: "acme-labs-demo"
  }
];

const DEMO_BITBUCKET_WORKSPACES = [{ slug: "acme-demo" }, { slug: "acme-labs-demo" }];

const DEMO_BITBUCKET_REPOS: Record<string, TBitbucketRepo[]> = {
  "acme-demo": [
    {
      uuid: "{00000000-0000-4000-8000-0000000b0001}",
      slug: "payments-api",
      full_name: "acme-demo/payments-api"
    },
    {
      uuid: "{00000000-0000-4000-8000-0000000b0002}",
      slug: "web-app",
      full_name: "acme-demo/web-app"
    }
  ],
  "acme-labs-demo": [
    {
      uuid: "{00000000-0000-4000-8000-0000000b0003}",
      slug: "experiments",
      full_name: "acme-labs-demo/experiments"
    }
  ]
};

const DEMO_BITBUCKET_ENVIRONMENTS: Record<string, { uuid: string; name: string; slug: string }[]> =
  {
    "payments-api": [
      { uuid: "{00000000-0000-4000-8000-0000000e0001}", name: "Staging", slug: "staging" },
      { uuid: "{00000000-0000-4000-8000-0000000e0002}", name: "Production", slug: "production" }
    ],
    "web-app": [{ uuid: "{00000000-0000-4000-8000-0000000e0003}", name: "Test", slug: "test" }]
  };

const DEMO_TRAVIS_BRANCHES: Record<string, { name: string; isDefault: boolean }[]> = {
  "70000001": [
    { name: "main", isDefault: true },
    { name: "develop", isDefault: false },
    { name: "release", isDefault: false }
  ],
  "70000002": [{ name: "master", isDefault: true }]
};

export const syncGitDemo: SyncGitLookups = {
  useGitLabProjects: ({ search }, options) =>
    ready(
      DEMO_GITLAB_PROJECTS.filter((project) => matches(search, project.name)),
      options?.enabled ?? true
    ),
  useGitLabGroups: ({ search }, options) =>
    ready(
      DEMO_GITLAB_GROUPS.filter((group) => matches(search, group.name, group.fullPath)),
      options?.enabled ?? true
    ),
  useBitbucketWorkspaces: ({ search }, options) =>
    ready(
      DEMO_BITBUCKET_WORKSPACES.filter((workspace) => matches(search, workspace.slug)),
      options?.enabled ?? true
    ),
  useBitbucketRepositories: ({ workspaceSlug, search }, options) =>
    ready(
      (DEMO_BITBUCKET_REPOS[workspaceSlug] ?? []).filter((repo) => matches(search, repo.slug)),
      options?.enabled ?? true
    ),
  useBitbucketEnvironments: ({ repositorySlug }, options) =>
    ready(DEMO_BITBUCKET_ENVIRONMENTS[repositorySlug] ?? [], options?.enabled ?? true),
  useCircleCIOrganizations: listOf([
    {
      name: "acme-demo",
      projects: [
        { id: "00000000-0000-4000-8000-0000000c0001", name: "payments-api" },
        { id: "00000000-0000-4000-8000-0000000c0002", name: "web-app" }
      ]
    },
    {
      name: "acme-labs-demo",
      projects: [{ id: "00000000-0000-4000-8000-0000000c0003", name: "experiments" }]
    }
  ]),
  useTravisCIRepositories: listOf([
    { id: "70000001", name: "payments-api", slug: "acme-demo/payments-api" },
    { id: "70000002", name: "web-app", slug: "acme-demo/web-app" }
  ]),
  useTravisCIBranches: ({ repositoryId }, options) =>
    ready(DEMO_TRAVIS_BRANCHES[repositoryId] ?? [], options?.enabled ?? true),
  useTeamCityProjects: listOf([
    {
      id: "AcmeDemo_Payments",
      name: "Acme demo payments",
      buildTypes: {
        buildType: [
          { id: "AcmeDemo_Payments_Build", name: "Build" },
          { id: "AcmeDemo_Payments_Deploy", name: "Deploy" }
        ]
      }
    },
    {
      id: "AcmeDemo_Web",
      name: "Acme demo web",
      buildTypes: { buildType: [{ id: "AcmeDemo_Web_Build", name: "Build" }] }
    },
    { id: "AcmeDemo_Empty", name: "Acme demo empty", buildTypes: { buildType: [] } }
  ])
};
