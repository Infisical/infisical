import { SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP } from "@app/helpers/secretScanningV2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningFindingOrderBy,
  SecretScanningFindingSeverity,
  SecretScanningFindingStatus,
  SecretScanningScanStatus
} from "@app/hooks/api/secretScanningV2/enums";
import type {
  TSecretScanningDataSource,
  TSecretScanningDataSourceOption,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningFinding,
  TSecretScanningResource
} from "@app/hooks/api/secretScanningV2/types";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { SecretScanningAdapter } from "./contract";

export const SECRET_SCANNING_DEMO_PROJECT_ID = "secret-scanning";

const projectId = SECRET_SCANNING_DEMO_PROJECT_ID;
const uuid = (prefix: string, index: number) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const loadedAt = Date.now();
const ago = (minutes: number) => new Date(loadedAt - minutes * 60_000).toISOString();

const seeded: TSecretScanningDataSourceWithDetails[] = [
  {
    id: uuid("d5", 1),
    name: "acme-corp",
    description: "Production and platform repositories",
    type: SecretScanningDataSource.GitHub,
    config: {},
    lastScannedAt: ago(12),
    lastScanStatus: SecretScanningScanStatus.Completed,
    lastScanStatusMessage: null,
    isScanNewCommitsEnabled: true
  },
  {
    id: uuid("d5", 2),
    name: "acme-labs",
    description: null,
    type: SecretScanningDataSource.GitHub,
    config: {},
    lastScannedAt: ago(25),
    lastScanStatus: SecretScanningScanStatus.Scanning,
    lastScanStatusMessage: null,
    isScanNewCommitsEnabled: true
  },
  {
    id: uuid("d5", 3),
    name: "acme-oss",
    description: "Public open source projects",
    type: SecretScanningDataSource.GitHub,
    config: {},
    lastScannedAt: ago(60 * 6),
    lastScanStatus: SecretScanningScanStatus.Completed,
    lastScanStatusMessage: null,
    isScanNewCommitsEnabled: true
  },
  {
    id: uuid("d5", 4),
    name: "acme-platform",
    description: "Self-managed GitLab group",
    type: SecretScanningDataSource.GitLab,
    config: { scope: GitLabDataSourceScope.Group, groupId: 4821, groupName: "acme-platform" },
    lastScannedAt: ago(60 * 24 * 3),
    lastScanStatus: SecretScanningScanStatus.Completed,
    lastScanStatusMessage: null,
    isScanNewCommitsEnabled: false
  },
  {
    id: uuid("d5", 5),
    name: "acme-legacy",
    description: null,
    type: SecretScanningDataSource.Bitbucket,
    config: { workspaceSlug: "acme-legacy" },
    lastScannedAt: ago(60 * 24 * 9),
    lastScanStatus: SecretScanningScanStatus.Failed,
    lastScanStatusMessage: "Bitbucket returned 401 Unauthorized: the app password was revoked",
    isScanNewCommitsEnabled: true
  }
].map(
  (source) =>
    ({
      ...source,
      connectionId: null,
      connection: null,
      createdAt: ago(60 * 24 * 90),
      updatedAt: ago(60 * 24 * 90),
      projectId,
      isAutoScanEnabled: true,
      isHistoricalScanEnabled: true,
      isDiscoveryEnabled: true,
      isDisconnected: source.lastScanStatus === SecretScanningScanStatus.Failed,
      unresolvedFindings: null,
      resourceCount: 0
    }) as TSecretScanningDataSourceWithDetails
);

const repos: Record<string, string[]> = {
  "acme-corp": [
    "acme-corp/payments-api",
    "acme-corp/web-dashboard",
    "acme-corp/platform-core",
    "acme-corp/infra-terraform"
  ],
  "acme-labs": ["acme-labs/ml-pipelines", "acme-labs/checkout-prototype"],
  "acme-oss": ["acme-oss/acme-cli", "acme-oss/helm-charts"],
  "acme-platform": ["acme-platform/billing-service", "acme-platform/edge-proxy"],
  "acme-legacy": ["acme-legacy/monolith"]
};

const resources: TSecretScanningResource[] = seeded.flatMap((source, sourceIndex) =>
  (repos[source.name] ?? []).map((repo, repoIndex) => ({
    id: uuid("e5", sourceIndex * 10 + repoIndex + 1),
    dataSourceId: source.id,
    externalId: String(4_100_000 + sourceIndex * 10 + repoIndex),
    name: repo,
    createdAt: ago(60 * 24 * 90),
    updatedAt: ago(60 * 24 * 90)
  }))
);

const dataSourceStore = createFixtureStore(seeded);

type Seed = [
  repo: string,
  file: string,
  line: number,
  rule: string,
  author: string,
  commit: string,
  minutes: number
];

const open: Seed[] = [
  [
    "acme-corp/payments-api",
    "src/billing/stripe-client.ts",
    14,
    "stripe-access-token",
    "Marcus Webb",
    "3f9c2ab",
    12
  ],
  ["acme-corp/payments-api", ".env.example", 7, "generic-api-key", "Priya Raman", "b81e04d", 120],
  [
    "acme-corp/infra-terraform",
    "modules/rds/main.tf",
    42,
    "aws-access-token",
    "Tom Becker",
    "9a6d1f0",
    300
  ],
  [
    "acme-corp/web-dashboard",
    ".github/workflows/deploy.yml",
    27,
    "github-pat",
    "Diego Alvarez",
    "e2c7a95",
    480
  ],
  [
    "acme-corp/platform-core",
    "k8s/overlays/prod/secret.yaml",
    11,
    "private-key",
    "Hana Kim",
    "41bb3c8",
    1440
  ],
  [
    "acme-labs/ml-pipelines",
    "notebooks/feature-store/load_events.ipynb",
    118,
    "gcp-api-key",
    "Lena Novak",
    "c03f9e2",
    1500
  ],
  [
    "acme-corp/web-dashboard",
    "src/lib/notifications/slack.ts",
    9,
    "slack-webhook-url",
    "Diego Alvarez",
    "7d2e6b1",
    2880
  ],
  [
    "acme-oss/acme-cli",
    "internal/auth/testdata/token.json",
    3,
    "jwt",
    "Sarah Lin",
    "f5a1c47",
    2950
  ],
  [
    "acme-corp/payments-api",
    "scripts/seed-customers.py",
    8,
    "sendgrid-api-token",
    "Priya Raman",
    "2b9f8d3",
    4320
  ],
  [
    "acme-labs/checkout-prototype",
    "server/config.js",
    22,
    "stripe-access-token",
    "Marcus Webb",
    "aa40e6c",
    5760
  ],
  [
    "acme-corp/platform-core",
    "deploy/helm/values-staging.yaml",
    64,
    "twilio-api-key",
    "Tom Becker",
    "5c71b0a",
    7200
  ],
  [
    "acme-oss/helm-charts",
    "charts/agent/values.yaml",
    31,
    "generic-api-key",
    "Hana Kim",
    "d9e3a28",
    8640
  ],
  [
    "acme-corp/infra-terraform",
    "environments/prod/backend.tf",
    5,
    "aws-access-token",
    "Tom Becker",
    "08fd4b7",
    10080
  ],
  [
    "acme-corp/web-dashboard",
    "cypress/fixtures/session.json",
    2,
    "jwt",
    "Lena Novak",
    "6e2a9d1",
    20160
  ]
];

const rules = [
  "generic-api-key",
  "aws-access-token",
  "github-pat",
  "stripe-access-token",
  "private-key",
  "jwt"
];
const authors = [
  "Sarah Lin",
  "Marcus Webb",
  "Priya Raman",
  "Diego Alvarez",
  "Hana Kim",
  "Tom Becker",
  "Lena Novak"
];
const files = [
  "README.md",
  "config/default.json",
  "docker-compose.yml",
  "src/index.ts",
  "tests/fixtures/env.json",
  "Makefile"
];
const closedStatuses = [
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.FalsePositive,
  SecretScanningFindingStatus.Ignore
];

const closed = Array.from({ length: 37 }, (_, index) => {
  const repo = resources[(index * 5) % resources.length].name;
  return {
    seed: [
      repo,
      files[index % files.length],
      3 + ((index * 17) % 90),
      rules[(index * 7) % rules.length],
      authors[(index * 3) % authors.length],
      ((index + 11) * 2654435761).toString(16).slice(-7),
      60 * 24 * 7 * (2 + Math.floor(index / 3))
    ] as Seed,
    status: closedStatuses[(index >= 29 ? 1 : 0) + (index >= 35 ? 1 : 0)]
  };
});

const finding = (
  [repo, file, line, rule, author, commit, minutes]: Seed,
  index: number,
  status: SecretScanningFindingStatus
): TSecretScanningFinding => {
  const resource = resources.find((entry) => entry.name === repo) ?? resources[0];
  const dataSource = seeded.find((entry) => entry.id === resource.dataSourceId) ?? seeded[0];
  const fingerprint = `${commit}:${file}:${rule}:${line}`;
  return {
    id: uuid("f1", index + 1),
    resourceId: resource.id,
    resourceName: repo,
    dataSourceId: dataSource.id,
    dataSourceName: dataSource.name,
    dataSourceType: dataSource.type,
    rule,
    severity: SecretScanningFindingSeverity.High,
    status,
    fingerprint,
    details: {
      description: `Detected a ${rule} in ${file}`,
      startLine: line,
      endLine: line,
      startColumn: 1,
      endColumn: 40,
      file,
      link: `https://github.com/${repo}/blob/${commit}/${file}#L${line}`,
      symlinkFile: "",
      commit,
      entropy: "4.2",
      author,
      email: `${author.split(" ")[0].toLowerCase()}@acme.dev`,
      date: ago(minutes),
      message: "Update configuration",
      tags: [],
      ruleID: rule,
      fingerprint
    },
    projectId,
    scanId: uuid("a5", 1),
    createdAt: ago(minutes),
    updatedAt: ago(minutes)
  };
};

const store = createFixtureStore<TSecretScanningFinding[]>([
  ...open.map((seed, index) => finding(seed, index, SecretScanningFindingStatus.Unresolved)),
  ...closed.map(({ seed, status }, index) => finding(seed, open.length + index, status))
]);

const sortKey: Record<SecretScanningFindingOrderBy, (entry: TSecretScanningFinding) => string> = {
  [SecretScanningFindingOrderBy.CreatedAt]: (entry) => entry.createdAt,
  [SecretScanningFindingOrderBy.Rule]: (entry) => entry.rule,
  [SecretScanningFindingOrderBy.ResourceName]: (entry) => entry.resourceName,
  [SecretScanningFindingOrderBy.Author]: (entry) => entry.details.author,
  [SecretScanningFindingOrderBy.Status]: (entry) => entry.status
};

const connections: Partial<Record<AppConnection, { id: string; name: string }[]>> = {
  [AppConnection.GitHubRadar]: [
    { id: uuid("c5", 1), name: "acme-github-app" },
    { id: uuid("c5", 2), name: "acme-labs-github-app" }
  ],
  [AppConnection.Bitbucket]: [{ id: uuid("c5", 3), name: "acme-bitbucket" }],
  [AppConnection.GitLab]: [{ id: uuid("c5", 4), name: "acme-gitlab" }]
};

const workspaces = ["acme", "acme-legacy", "acme-mobile"];

const groups = [
  { id: "4821", name: "acme-platform", fullName: "acme-platform", fullPath: "acme-platform" },
  { id: "4822", name: "payments", fullName: "acme / payments", fullPath: "acme/payments" },
  { id: "4823", name: "mobile", fullName: "acme / mobile", fullPath: "acme/mobile" }
];

const configStore = createFixtureStore({
  projectId,
  content: [
    "[extend]",
    "useDefault = true",
    "",
    "[[allowlists]]",
    'description = "Test fixtures"',
    'paths = ["""(.*?)(test|spec)/fixtures/"""]',
    "",
    "[[rules]]",
    'id = "acme-internal-token"',
    'description = "Acme internal service token"',
    "regex = '''acme_[a-z0-9]{32}'''",
    'keywords = ["acme_"]'
  ].join("\n") as string | null
});

let created = 0;

export const secretScanningDemo: SecretScanningAdapter = {
  useProjectId: () => ({ data: projectId, isPending: false, error: null }),
  useInstanceState: () => ({
    data: { activeProjectId: projectId, projects: [], isMultiInstance: false },
    isPending: false,
    error: null
  }),
  useFindings: ({ status, dataSourceId, resourceId, orderBy, orderDirection, offset, limit }) => {
    const direction = orderDirection === OrderByDirection.ASC ? 1 : -1;
    const matched = store
      .use()
      .filter(
        (entry) =>
          (!status || entry.status === status) &&
          (!dataSourceId || entry.dataSourceId === dataSourceId) &&
          (!resourceId || entry.resourceId === resourceId)
      )
      .sort((a, b) => sortKey[orderBy](a).localeCompare(sortKey[orderBy](b)) * direction);
    return {
      data: { findings: matched.slice(offset, offset + limit), totalCount: matched.length },
      isPending: false,
      isPlaceholderData: false,
      error: null
    };
  },
  useUnresolvedFindingCount: () => ({
    data: store.use().filter((entry) => entry.status === SecretScanningFindingStatus.Unresolved)
      .length,
    isPending: false,
    error: null
  }),
  useDataSources: () => ({ data: dataSourceStore.use(), isPending: false, error: null }),
  useDashboardDataSources: () => {
    const findings = store.use();
    return {
      data: dataSourceStore.use().map((source) => ({
        ...source,
        resourceCount: resources.filter((entry) => entry.dataSourceId === source.id).length,
        unresolvedFindings: source.lastScannedAt
          ? findings.filter(
              (entry) =>
                entry.dataSourceId === source.id &&
                entry.status === SecretScanningFindingStatus.Unresolved
            ).length
          : null
      })),
      isPending: false,
      error: null
    };
  },
  useDataSourceOptions: () => ({
    data: [
      { name: "GitHub", type: SecretScanningDataSource.GitHub, connection: AppConnection.GitHub },
      {
        name: "Bitbucket",
        type: SecretScanningDataSource.Bitbucket,
        connection: AppConnection.Bitbucket
      },
      { name: "GitLab", type: SecretScanningDataSource.GitLab, connection: AppConnection.GitLab }
    ] as TSecretScanningDataSourceOption[],
    isPending: false,
    error: null
  }),
  useAvailableConnections: (app) => ({
    data: (connections[app] ?? []).map((entry) => ({ ...entry, projectId })),
    isPending: false,
    error: null
  }),
  useBitbucketWorkspaces: (connectionId, search) => ({
    data: connectionId
      ? workspaces
          .filter((slug) => !search || slug.includes(search.toLowerCase()))
          .map((slug) => ({ slug }))
      : [],
    isPending: false,
    error: null
  }),
  useGitLabGroups: (connectionId, search) => ({
    data: connectionId
      ? groups.filter((group) => !search || group.fullPath.includes(search.toLowerCase()))
      : [],
    isPending: false,
    error: null
  }),
  useCreateDataSource: fixtureMutation(({ connectionId, ...dto }) => {
    created += 1;
    const connection = Object.values(connections)
      .flat()
      .find((entry) => entry?.id === connectionId);
    const now = new Date().toISOString();
    const entry = {
      ...dto,
      id: uuid("d6", created),
      description: dto.description ?? null,
      connectionId: connectionId ?? null,
      connection: connection
        ? {
            ...connection,
            app: SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dto.type]
          }
        : null,
      createdAt: now,
      updatedAt: now,
      isAutoScanEnabled: dto.isScanNewCommitsEnabled,
      isDisconnected: false,
      lastScannedAt: null,
      lastScanStatus: dto.isHistoricalScanEnabled ? SecretScanningScanStatus.Queued : null,
      lastScanStatusMessage: null,
      unresolvedFindings: null,
      resourceCount: 0
    } as TSecretScanningDataSourceWithDetails;
    dataSourceStore.update((entries) => [...entries, entry]);
    return entry;
  }),
  useConfig: () => ({ data: configStore.use(), isPending: false, error: null }),
  useUpdateConfig: fixtureMutation((config) => {
    configStore.update(() => config);
    return config;
  }),
  useUpdateDataSource: fixtureMutation(({ dataSourceId, type, projectId: _, ...changes }) => {
    dataSourceStore.update((entries) =>
      entries.map((entry) =>
        entry.id === dataSourceId
          ? ({ ...entry, ...changes, updatedAt: new Date().toISOString() } as typeof entry)
          : entry
      )
    );
    return dataSourceStore
      .get()
      .find((entry) => entry.id === dataSourceId) as TSecretScanningDataSource;
  }),
  useDeleteDataSource: fixtureMutation(({ dataSourceId }) => {
    const removed = dataSourceStore
      .get()
      .find((entry) => entry.id === dataSourceId) as TSecretScanningDataSource;
    dataSourceStore.update((entries) => entries.filter((entry) => entry.id !== dataSourceId));
    store.update((entries) => entries.filter((entry) => entry.dataSourceId !== dataSourceId));
    return removed;
  }),
  useResources: ({ dataSourceId }) => ({
    data: resources.filter((entry) => entry.dataSourceId === dataSourceId),
    isPending: false,
    error: null
  }),
  useUpdateFindings: fixtureMutation((updates) => {
    store.update((entries) =>
      entries.map((entry) => {
        const update = updates.find((item) => item.findingId === entry.id);
        return update
          ? { ...entry, status: update.status, triageComment: update.triageComment ?? null }
          : entry;
      })
    );
    return store
      .get()
      .find((entry) => entry.id === updates[0]?.findingId) as TSecretScanningFinding;
  })
};

export const secretScanningDemoCounts = () => ({
  dataSourcesCount: dataSourceStore.get().length,
  resourcesCount: resources.length,
  findingsCount: store.get().length,
  projectsCount: 1
});
