import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import {
  ExternalMigrationImportStatus,
  type TDopplerConfig,
  type TDopplerProject
} from "@app/hooks/api/migration/types";

import type { SecretsExternalImportAdapter, TVaultMount } from "./contract-external-import";
import { childPath, type DemoStore, now, type Scenario, useScenario, useStore } from "./demo-store";
import type { DemoSecret } from "./fixtures";

type VaultTree = {
  namespaces: string[];
  mounts: TVaultMount[];
  paths: Record<string, string[]>;
  skipped: Record<string, string[]>;
};
type ImportFixtures = {
  connections: (TAvailableAppConnection & { app: AppConnection })[];
  vault: VaultTree;
  doppler: { projects: TDopplerProject[]; configs: Record<string, TDopplerConfig[]> };
};

const connection = (
  app: AppConnection,
  index: number,
  name: string,
  projectId?: string
): ImportFixtures["connections"][number] => ({
  id: `00000000-0000-4000-9200-${app === AppConnection.HCVault ? "1" : "2"}${String(index).padStart(11, "0")}`,
  name,
  app,
  projectId
});

const dopplerProject = (slug: string, name: string, description?: string): TDopplerProject => ({
  id: `doppler-${slug}`,
  slug,
  name,
  description
});

const configsOf = (project: string, environments: [string, string[]][]): TDopplerConfig[] =>
  environments.flatMap(([environment, branches]) => [
    { name: environment, root: true, locked: false, environment, project },
    ...branches.map((branch) => ({
      name: `${environment}_${branch}`,
      root: false,
      locked: false,
      environment,
      project
    }))
  ]);

const sparse: ImportFixtures = {
  connections: [
    connection(AppConnection.HCVault, 1, "vault", "payments-api"),
    connection(AppConnection.Doppler, 1, "doppler", "payments-api")
  ],
  vault: {
    namespaces: ["/"],
    mounts: [{ path: "secret/", type: "kv", version: "2" }],
    paths: { "/:secret": ["secret/payments"] },
    skipped: {}
  },
  doppler: {
    projects: [dopplerProject("payments", "payments")],
    configs: { payments: configsOf("payments", [["dev", []]]) }
  }
};

const rich: ImportFixtures = {
  connections: [
    connection(AppConnection.HCVault, 1, "vault-production", "payments-api"),
    connection(AppConnection.HCVault, 2, "vault-shared"),
    connection(AppConnection.Doppler, 1, "doppler-workspace", "payments-api")
  ],
  vault: {
    namespaces: ["/", "engineering", "platform"],
    mounts: [
      { path: "secret/", type: "kv", version: "2" },
      { path: "kv-legacy/", type: "kv", version: "1" },
      { path: "pki/", type: "pki", version: null },
      { path: "transit/", type: "transit", version: null }
    ],
    paths: {
      "/:secret": [
        "secret/payments/api",
        "secret/payments/worker",
        "secret/payments/stripe",
        "secret/billing/invoices",
        "secret/shared/database",
        "secret/shared/redis"
      ],
      "/:kv-legacy": ["kv-legacy/payments", "kv-legacy/notifications"],
      "engineering:secret": ["secret/ci/github", "secret/ci/npm-registry"],
      "platform:secret": ["secret/observability/datadog"]
    },
    skipped: { "/:secret": ["secret/tenants/+/config"] }
  },
  doppler: {
    projects: [
      dopplerProject("payments-api", "payments-api", "Card processing and payouts"),
      dopplerProject("checkout-web", "checkout-web"),
      dopplerProject("notifications", "notifications")
    ],
    configs: {
      "payments-api": configsOf("payments-api", [
        ["dev", ["sarah", "ci"]],
        ["stg", []],
        ["prd", ["hotfix"]]
      ]),
      "checkout-web": configsOf("checkout-web", [
        ["dev", []],
        ["prd", []]
      ]),
      notifications: configsOf("notifications", [["dev", []]])
    }
  }
};

const longSegments = [
  "payments-settlement-reconciliation-service",
  "customer-identity-verification-pipeline",
  "merchant-onboarding-risk-scoring-engine",
  "regional-ledger-replication-coordinator",
  "fraud-detection-feature-store-ingestion"
];

const stressed: ImportFixtures = {
  connections: [
    ...[
      "vault-production-us-east-1-primary-cluster-approle",
      "vault-production-eu-central-1-disaster-recovery-replica",
      "vault-staging-shared-platform-engineering-namespace",
      "vault-legacy-datacenter-migration-read-only-token",
      "vault-sandbox"
    ].map((name, index) =>
      connection(AppConnection.HCVault, index + 1, name, index % 2 ? undefined : "payments-api")
    ),
    ...[
      "doppler-payments-organization-service-account-read-only",
      "doppler-platform-team-workspace-token"
    ].map((name, index) => connection(AppConnection.Doppler, index + 1, name, "payments-api"))
  ],
  vault: {
    namespaces: [
      "/",
      "engineering",
      "engineering/payments-platform-infrastructure",
      "engineering/payments-platform-infrastructure/settlement-and-reconciliation"
    ],
    mounts: [
      { path: "secret/", type: "kv", version: "2" },
      { path: "payments-platform-shared-kv-store-version-two/", type: "kv", version: "2" },
      { path: "kv-legacy/", type: "kv", version: "1" },
      { path: "pki/", type: "pki", version: null }
    ],
    paths: {
      "/:secret": longSegments.flatMap((segment) =>
        ["api", "worker", "scheduler", "migrations", "read-replica", "webhook-dispatcher"].map(
          (leaf) => `secret/${segment}/${leaf}`
        )
      ),
      "/:payments-platform-shared-kv-store-version-two": longSegments.map(
        (segment) => `payments-platform-shared-kv-store-version-two/${segment}`
      ),
      "/:kv-legacy": ["kv-legacy/payments.v1", "kv-legacy/old service"]
    },
    skipped: {
      "/:secret": longSegments.flatMap((segment) => [
        `secret/${segment}/tenants/+/credentials`,
        `secret/${segment}/regions/+/replicas/+/config`
      ])
    }
  },
  doppler: {
    projects: Array.from({ length: 18 }, (_, index) => {
      const slug = `${longSegments[index % longSegments.length]}-${index + 1}`;
      return dopplerProject(
        slug,
        slug,
        index % 3 ? undefined : "Shared configuration for the settlement and reconciliation stack"
      );
    }),
    configs: Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => {
        const slug = `${longSegments[index % longSegments.length]}-${index + 1}`;
        return [
          slug,
          configsOf(slug, [
            [
              "dev",
              ["sarah-lin-local-debugging-session", "ci-integration-test-runner", "feature-x"]
            ],
            ["stg", ["release-candidate-2026-11-14-hotfix-validation"]],
            ["prd", ["emergency-rollback-window"]]
          ])
        ];
      })
    )
  }
};

const fixturesOf = (scenario: Scenario) => {
  if (scenario === "empty") return sparse;
  if (scenario === "large") return stressed;
  return rich;
};
const useFixtures = () => fixturesOf(useScenario());
const ready = <T>(data: T | undefined) => ({ data, isPending: false, error: null });

const secretName = (source: string, suffix: string) =>
  `${source
    .split(/[/_]/)
    .filter(Boolean)
    .pop()!
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase()}_${suffix}`;

const sourceSecrets = (source: string, large: boolean) =>
  ["API_KEY", "DATABASE_URL", "WEBHOOK_SECRET"].map((suffix, index) => ({
    key: secretName(source, suffix),
    value: large
      ? `${source}:${suffix.toLowerCase()}:${"x9Kq2mVb7RtL4wZp".repeat(6 + index)}`
      : `${suffix.toLowerCase()}-${index + 1}a7f`
  }));

const addSecrets = (
  store: DemoStore,
  scope: { projectId: string; environment: string; path: string },
  entries: { key: string; value: string }[]
) =>
  store.update((state) => {
    const timestamp = now();
    const fresh = entries.filter(
      (entry) =>
        !state.secrets.some(
          (secret) =>
            secret.projectId === scope.projectId &&
            secret.env === scope.environment &&
            secret.path === scope.path &&
            secret.key === entry.key
        )
    );
    return {
      ...state,
      secrets: [
        ...state.secrets,
        ...fresh.map((entry): DemoSecret => ({
          id: crypto.randomUUID(),
          projectId: scope.projectId,
          env: scope.environment,
          path: scope.path,
          key: entry.key,
          value: entry.value,
          isEmpty: !entry.value,
          secretValueHidden: false,
          version: 1,
          tags: [],
          secretMetadata: [],
          createdAt: timestamp,
          updatedAt: timestamp
        }))
      ]
    };
  });

const ensureFolders = (
  store: DemoStore,
  scope: { projectId: string; environment: string; path: string },
  segments: string[]
) =>
  segments.reduce((parent, name) => {
    store.update((state) =>
      state.folders.some(
        (folder) =>
          folder.projectId === scope.projectId &&
          folder.environment === scope.environment &&
          folder.path === parent &&
          folder.name === name
      )
        ? state
        : {
            ...state,
            folders: [
              ...state.folders,
              {
                id: crypto.randomUUID(),
                name,
                description: "",
                projectId: scope.projectId,
                environment: scope.environment,
                path: parent
              }
            ]
          }
    );
    return childPath(parent, name);
  }, scope.path);

export const secretsExternalImportDemo: SecretsExternalImportAdapter = {
  useImportConnections: (app, _projectId, options) => {
    const { connections } = useFixtures();
    return ready(
      options?.enabled === false ? undefined : connections.filter((entry) => entry.app === app)
    );
  },
  useVaultNamespaces: (connectionId) => {
    const { vault } = useFixtures();
    return ready(
      connectionId ? vault.namespaces.map((name) => ({ id: `ns-${name}`, name })) : undefined
    );
  },
  useVaultMounts: (enabled, namespace, connectionId) => {
    const { vault } = useFixtures();
    return ready(enabled && namespace && connectionId ? vault.mounts : undefined);
  },
  useVaultSecretPaths: (enabled, namespace, mountPath, connectionId) => {
    const { vault } = useFixtures();
    const key = `${namespace}:${mountPath}`;
    return ready(
      enabled && namespace && mountPath && connectionId
        ? { secretPaths: vault.paths[key] ?? [], skippedWildcardPaths: vault.skipped[key] ?? [] }
        : undefined
    );
  },
  useDopplerProjects: (connectionId) => {
    const { doppler } = useFixtures();
    return ready(connectionId ? doppler.projects : undefined);
  },
  useDopplerConfigs: (connectionId, projectSlug) => {
    const { doppler } = useFixtures();
    return ready(connectionId && projectSlug ? (doppler.configs[projectSlug] ?? []) : undefined);
  },
  useImportVaultSecrets: () => {
    const store = useStore();
    const large = useScenario() === "large";
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        const mountSegments = dto.mountPath.split("/").filter(Boolean);
        const importedPaths = dto.vaultSecretPaths.map((source) => {
          const scope = {
            projectId: dto.projectId,
            environment: dto.environment,
            path: dto.secretPath
          };
          const path = dto.keepVaultStructure
            ? ensureFolders(
                store,
                scope,
                source.split("/").filter(Boolean).slice(mountSegments.length)
              )
            : dto.secretPath;
          addSecrets(store, { ...scope, path }, sourceSecrets(source, large));
          return path;
        });
        return {
          status: ExternalMigrationImportStatus.Imported,
          importedPaths: [...new Set(importedPaths)]
        };
      }
    };
  },
  useImportDopplerSecrets: () => {
    const store = useStore();
    const large = useScenario() === "large";
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        const entries = sourceSecrets(`${dto.dopplerProject}_${dto.dopplerEnvironment}`, large);
        addSecrets(
          store,
          {
            projectId: dto.targetProjectId,
            environment: dto.targetEnvironment,
            path: dto.targetSecretPath
          },
          entries
        );
        return { status: "imported", imported: entries.length };
      }
    };
  }
};
