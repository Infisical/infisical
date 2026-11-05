import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DynamicSecretProviders,
  DynamicSecretStatus,
  type TDynamicSecret
} from "@app/hooks/api/dynamicSecret/types";
import {
  DynamicSecretLeaseStatus,
  type TDynamicSecretLease
} from "@app/hooks/api/dynamicSecretLease/types";
import {
  HoneyTokenManagedBy,
  HoneyTokenStatus,
  HoneyTokenType
} from "@app/hooks/api/honeyTokens/enums";
import type { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import {
  ProjectType,
  ProjectVersion,
  type Project,
  type ProjectEnv
} from "@app/hooks/api/projects/types";
import { ProxiedServiceCredentialRole } from "@app/hooks/api/proxiedServices/enums";
import type { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";
import {
  ApprovalStatus,
  CommitType,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import type { TSecretFolder } from "@app/hooks/api/secretFolders/types";
import type { TSecretImport } from "@app/hooks/api/secretImports/types";
import { SecretRotation, SecretRotationStatus } from "@app/hooks/api/secretRotationsV2/enums";
import type { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2/types";
import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";
import type { WsTag } from "@app/hooks/api/tags/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { type DemoFolderAccess, seedFolderAccess } from "./demo-access-seed";
import { type DemoCommit, seedDemoCommits } from "./demo-commits-seed";
import { seedSecretSyncs } from "./demo-syncs";

type Scope = { projectId: string; environment: string; path: string };
export type DemoSecret = SecretV3RawSanitized & { projectId: string; path: string };
export type DemoFolder = TSecretFolder & Scope;
export type DemoImport = TSecretImport & Scope;
export type DemoDynamicSecret = TDynamicSecret & Scope & { inputs?: unknown };
export type DemoProxiedService = TDashboardProxiedService & { projectId: string };
export type SecretsFixtures = {
  projects: Project[];
  tags: WsTag[];
  secrets: DemoSecret[];
  folders: DemoFolder[];
  imports: DemoImport[];
  dynamicSecrets: DemoDynamicSecret[];
  rotations: TSecretRotationV2[];
  honeyTokens: TDashboardHoneyToken[];
  proxiedServices: DemoProxiedService[];
  approvals: TSecretApprovalRequest[];
  versionHistory: Record<string, DemoVersion[]>;
  leases: Record<string, TDynamicSecretLease[]>;
  secretSyncs: TSecretSync[];
  commits: DemoCommit[];
  folderAccess: DemoFolderAccess;
};
export type DemoVersion = {
  version: number;
  value: string;
  createdAt: string;
  actor: string;
  actorType: string;
  redacted?: boolean;
};

export const DEMO_USER = {
  userId: "demo-user-sarah",
  email: "sarah@acme.dev",
  firstName: "Sarah",
  lastName: "Lin",
  username: "sarah@acme.dev"
};

const created = "2026-10-20T09:00:00Z";
const environments: ProjectEnv[] = [
  { id: "env-dev", name: "Development", slug: "dev" },
  { id: "env-staging", name: "Staging", slug: "staging" },
  { id: "env-prod", name: "Production", slug: "prod" }
];
const all = environments.map((environment) => environment.slug);
export const envOf = (slug: string) =>
  environments.find((environment) => environment.slug === slug)!;

const project = (id: string, description: string): Project => ({
  __v: 0,
  id,
  name: id,
  type: ProjectType.SecretManager,
  description,
  orgId: V4_DEMO_ORG_ID,
  version: ProjectVersion.V3,
  upgradeStatus: null,
  updatedAt: created,
  autoCapitalization: false,
  environments,
  deletedEnvironments: [],
  pitVersionLimit: 10,
  auditLogsRetentionDays: 30,
  slug: id,
  createdAt: created,
  hasDeleteProtection: false,
  secretSharing: true,
  showSnapshotsLegacy: false,
  secretDetectionIgnoreValues: [],
  enforceEncryptedSecretManagerSecretMetadata: false,
  secretBlindIndexEnabled: true,
  isLegacyAdditionalPrivilegesEnabled: false
});

const tag = (slug: string): WsTag => ({
  id: `tag-${slug}`,
  slug,
  projectId: "payments-api",
  createdAt: created,
  updatedAt: created,
  __v: 0
});
const tags = [tag("config"), tag("webhooks")];

const stamp = (index: number) => new Date(Date.UTC(2026, 9, 22, 12, index % 60)).toISOString();
const id = (...parts: string[]) => parts.join(":");

type SecretSeed = {
  name: string;
  envs: string[];
  empty?: string[];
  values?: Partial<Record<string, string>>;
  comment?: string;
  tags?: string[];
  override?: string;
  rotationId?: string;
  honeyToken?: boolean;
  dev?: Partial<SecretV3RawSanitized>;
};

const referencingDatabaseUrl =
  // eslint-disable-next-line no-template-curly-in-string -- Infisical secret reference syntax, not a JS template
  "postgres://${APP_DB_USERNAME}:${APP_DB_PASSWORD}@db.dev.example.test:5432/payments";
// eslint-disable-next-line no-template-curly-in-string -- Infisical secret reference syntax, not a JS template
const corsOrigins = "https://app.dev.example.test,${dev.API_BASE_URL}";
// eslint-disable-next-line no-template-curly-in-string -- Infisical secret reference syntax, not a JS template
const sentryDsn = "https://${SENTRY_PUBLIC_KEY}@o0.ingest.sentry.example.test/0";
// eslint-disable-next-line no-template-curly-in-string -- Infisical secret reference syntax, not a JS template
const stripeAuthHeader = "Bearer ${STRIPE_SECRET_KEY}";
// eslint-disable-next-line no-template-curly-in-string -- Infisical secret reference syntax, not a JS template
const webhookRetryLimit = "${dev.workers.QUEUE_CONCURRENCY}";

const secretsAt = (projectId: string, path: string, seeds: SecretSeed[], sink: DemoSecret[]) =>
  seeds.forEach((seed) =>
    seed.envs.forEach((environment) => {
      const value = seed.empty?.includes(environment)
        ? ""
        : (seed.values?.[environment] ??
          `fake-${seed.name.toLowerCase().replace(/_/g, "-")}-${environment}`);
      const secretId = id(projectId, environment, path, seed.name);
      sink.push({
        id: secretId,
        projectId,
        env: environment,
        path,
        key: seed.name,
        value,
        isEmpty: value === "",
        secretValueHidden: false,
        version: 1,
        comment: seed.comment ?? "",
        tags: tags.filter((entry) => seed.tags?.includes(entry.slug)),
        secretMetadata: [],
        createdAt: created,
        updatedAt: stamp(sink.length),
        ...(seed.override && environment === "dev"
          ? { idOverride: `${secretId}:override`, valueOverride: seed.override }
          : {}),
        ...(seed.rotationId ? { isRotatedSecret: true, rotationId: seed.rotationId } : {}),
        ...(seed.honeyToken ? { isHoneyTokenSecret: true } : {}),
        ...(environment === "dev" ? seed.dev : {})
      });
    })
  );

const folders = (projectId: string, path: string, name: string, envs: string[]) =>
  envs.map((environment): DemoFolder => ({
    id: id(projectId, environment, path, "folder", name),
    name,
    description: "",
    projectId,
    environment,
    path
  }));

const secretImport = (
  path: string,
  environment: string,
  source: { environment: string; path: string },
  extra: Partial<TSecretImport> = {}
): DemoImport => ({
  id: id("payments-api", environment, path, "import", source.environment, source.path),
  folderId: id("payments-api", environment, path),
  importPath: source.path,
  importEnv: envOf(source.environment),
  position: "1",
  createdAt: created,
  updatedAt: created,
  isReplication: false,
  projectId: "payments-api",
  environment,
  path,
  ...extra
});

const dynamicSecret = (
  path: string,
  environment: string,
  name: string,
  extra: Partial<TDynamicSecret> = {}
): DemoDynamicSecret => ({
  id: id("payments-api", environment, path, "dynamic", name),
  name,
  type: DynamicSecretProviders.SqlDatabase,
  inputs: {
    client: "postgres",
    host: "fake-db.payments.internal",
    port: 5432,
    database: "payments",
    username: "fake-admin",
    password: "fake-password",
    creationStatement:
      "CREATE USER \"{{username}}\" WITH ENCRYPTED PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
    revocationStatement: 'DROP USER "{{username}}";',
    renewStatement: "ALTER USER \"{{username}}\" VALID UNTIL '{{expiration}}';"
  },
  usernameTemplate: "{{randomUsername}}",
  metadata: [],
  defaultTTL: "1h",
  maxTTL: "24h",
  createdAt: created,
  updatedAt: created,
  projectId: "payments-api",
  environment,
  path,
  ...extra
});

const rotation = (
  path: string,
  environment: string,
  name: string,
  connection: string,
  keys: [string, string]
): TSecretRotationV2 => ({
  id: `rotation-${name}`,
  name,
  description: null,
  folderId: id("payments-api", environment, path),
  connectionId: `connection-${connection}`,
  createdAt: created,
  updatedAt: created,
  rotationInterval: 30,
  rotateAtUtc: { hours: 0, minutes: 0 },
  projectId: "payments-api",
  rotationStatus: SecretRotationStatus.Success,
  lastRotationJobId: null,
  lastRotatedAt: "2026-10-20T00:00:00Z",
  lastRotationAttemptedAt: "2026-10-20T00:00:00Z",
  lastRotationMessage: null,
  connection: { app: AppConnection.Postgres, id: `connection-${connection}`, name: connection },
  environment: envOf(environment),
  folder: { id: id("payments-api", environment, path), path },
  isAutoRotationEnabled: true,
  nextRotationAt: "2026-11-24T00:00:00Z",
  type: SecretRotation.PostgresCredentials,
  parameters: { username1: `${name}-a`, username2: `${name}-b` },
  secretsMapping: { username: keys[0], password: keys[1] },
  secrets: []
});

const honeyToken = (
  path: string,
  environment: string,
  name: string,
  keys: [string, string]
): TDashboardHoneyToken => ({
  id: `honey-${name}`,
  name,
  description: null,
  status: HoneyTokenStatus.Active,
  projectId: "payments-api",
  folderId: id("payments-api", environment, path),
  createdAt: created,
  updatedAt: created,
  type: HoneyTokenType.AWS,
  config: { managedBy: HoneyTokenManagedBy.Organization },
  secretsMapping: { accessKeyId: keys[0], secretAccessKey: keys[1] },
  environment: envOf(environment),
  folder: { path }
});

const proxiedService = (
  path: string,
  environment: string,
  name: string,
  hostPattern: string,
  secretKey: string,
  extra: { headerName: string; headerPrefix: string; isEnabled?: boolean }
): DemoProxiedService => ({
  id: `proxy-${name}-${environment}`,
  name,
  hostPattern,
  isEnabled: extra.isEnabled ?? true,
  folderId: id("payments-api", environment, path),
  createdAt: created,
  updatedAt: created,
  lastUsedAt: null,
  credentials: [
    {
      id: `proxy-${name}-${environment}-credential`,
      serviceId: `proxy-${name}-${environment}`,
      role: ProxiedServiceCredentialRole.HeaderRewrite,
      headerName: extra.headerName,
      headerPrefix: extra.headerPrefix,
      secretKey
    }
  ],
  environment: envOf(environment),
  folder: { path },
  projectId: "payments-api"
});

const person = (firstName: string, lastName: string) => ({
  userId: `demo-user-${firstName.toLowerCase()}`,
  email: `${firstName.toLowerCase()}@acme.dev`,
  firstName,
  lastName,
  username: `${firstName.toLowerCase()}@acme.dev`
});

const approvalPolicy: TSecretApprovalRequest["policy"] = {
  id: "policy-production",
  project: "payments-api",
  name: "Production changes",
  environments: [envOf("prod")],
  secretPath: "/",
  approvals: 1,
  updatedAt: new Date(created),
  enforcementLevel: EnforcementLevel.Hard,
  allowedSelfApprovals: false,
  bypassForMachineIdentities: false,
  approvers: [DEMO_USER, person("Jordan", "Lee")].map((user) => ({
    ...user,
    isOrgMembershipActive: true
  })),
  bypassers: []
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();

const approval = (
  slug: string,
  committer: ReturnType<typeof person>,
  hours: number,
  changes: { op: CommitType; key: string }[]
): TSecretApprovalRequest => ({
  id: `request-${slug}`,
  slug,
  createdAt: hoursAgo(hours),
  updatedAt: hoursAgo(hours),
  committerUserId: committer.userId,
  reviewers: [],
  project: "payments-api",
  environment: "prod",
  folderId: id("payments-api", "prod", "/"),
  secretPath: "/",
  hasMerged: false,
  status: "open",
  policy: approvalPolicy,
  statusChangedByUserId: "",
  committerUser: committer,
  committerIdentity: null,
  conflicts: [],
  commits: changes.map((change, index) => ({
    id: `request-${slug}-commit-${index + 1}`,
    op: change.op,
    secretKey: change.key,
    secretValue: change.op === CommitType.DELETE ? undefined : `fake-${slug}-value`,
    algorithm: "aes-256-gcm",
    keyEncoding: "utf8",
    version: 1,
    secretVersion: {
      id: `request-${slug}-version-${index + 1}`,
      _id: `request-${slug}-version-${index + 1}`,
      project: "payments-api",
      environment: "prod",
      version: 1,
      type: "shared",
      secretValueHidden: false,
      secretKey: change.key,
      secretPath: "/",
      createdAt: hoursAgo(hours),
      updatedAt: hoursAgo(hours)
    }
  }))
});

const lease = (
  dynamicSecretId: string,
  index: number,
  hours: number,
  failed = false
): TDynamicSecretLease => ({
  id: `${dynamicSecretId}:lease-${index}`,
  version: 1,
  expireAt: new Date(Date.now() + hours * 3600000).toISOString(),
  dynamicSecretId,
  createdAt: created,
  updatedAt: created,
  ...(failed
    ? {
        status: DynamicSecretLeaseStatus.FailedDeletion,
        statusDetails: "The provider refused to revoke this lease."
      }
    : {})
});

const seedLeases = (secrets: DemoDynamicSecret[]) =>
  Object.fromEntries(
    secrets.map((entry) => [
      entry.id,
      [lease(entry.id, 1, 0.75), lease(entry.id, 2, 20, Boolean(entry.status))]
    ])
  );

export const createSecretsFixtures = (large: boolean): SecretsFixtures => {
  const secrets: DemoSecret[] = [];
  secretsAt(
    "payments-api",
    "/",
    [
      { name: "API_BASE_URL", envs: all, values: { dev: "https://api.dev.example.test" } },
      { name: "APP_DB_PASSWORD", envs: ["dev"], rotationId: "rotation-payments-app-db-creds" },
      { name: "APP_DB_USERNAME", envs: ["dev"], rotationId: "rotation-payments-app-db-creds" },
      { name: "AWS_ACCESS_KEY_ID_LEGACY", envs: ["prod"], honeyToken: true },
      { name: "AWS_SECRET_ACCESS_KEY_LEGACY", envs: ["prod"], honeyToken: true },
      { name: "CURRENCY_ALLOWLIST", envs: all, empty: ["dev"] },
      {
        name: "DATABASE_URL",
        envs: all,
        values: { dev: referencingDatabaseUrl },
        dev: {
          version: 3,
          secretMetadata: [
            { key: "owner", value: "payments-platform", isEncrypted: false },
            { key: "runbook", value: "fake-runbook-reference", isEncrypted: true }
          ],
          reminderRepeatDays: 90,
          reminderNote: "Rotate the payments database credentials."
        }
      },
      { name: "FEATURE_FLAGS", envs: all, tags: ["config"] },
      { name: "JWT_SIGNING_KEY", envs: all, override: "fake-personal-jwt-key" },
      { name: "LOG_LEVEL", envs: all, comment: "Raise to debug only while investigating." },
      { name: "REDIS_URL", envs: ["dev", "staging"] },
      { name: "SENTRY_DSN", envs: ["prod"], values: { prod: sentryDsn } },
      { name: "STRIPE_AUTH_HEADER", envs: ["dev"], values: { dev: stripeAuthHeader } },
      { name: "STRIPE_SECRET_KEY", envs: ["dev", "prod"] },
      { name: "STRIPE_WEBHOOK_SECRET", envs: all, empty: ["staging"] },
      ...(large
        ? Array.from({ length: 32 }, (_, index) => ({
            name: `DEMO_SETTING_${String(index + 1).padStart(2, "0")}`,
            envs: all
          }))
        : [])
    ],
    secrets
  );
  secretsAt(
    "payments-api",
    "/api",
    [
      { name: "BILLING_AWS_ACCESS_KEY_ID", envs: ["dev"], honeyToken: true },
      { name: "BILLING_AWS_SECRET_ACCESS_KEY", envs: ["dev"], honeyToken: true },
      { name: "CORS_ORIGINS", envs: all, values: { dev: corsOrigins } },
      { name: "FRAUD_SCORE_THRESHOLD", envs: ["prod"] },
      { name: "IDEMPOTENCY_TTL_SECONDS", envs: all, empty: ["dev"] },
      { name: "LEDGER_API_KEY", envs: ["dev", "staging"], override: "fake-personal-ledger-key" },
      { name: "LEDGER_DB_PASSWORD", envs: ["prod"], rotationId: "rotation-ledger-app-db-creds" },
      { name: "LEDGER_DB_USERNAME", envs: ["prod"], rotationId: "rotation-ledger-app-db-creds" },
      { name: "PAYMENT_PROVIDER", envs: all },
      { name: "PAYPAL_CLIENT_ID", envs: ["dev", "prod"] },
      { name: "PAYPAL_CLIENT_SECRET", envs: all, empty: ["staging"] },
      { name: "RATE_LIMIT_PER_MIN", envs: all, comment: "Applies per API key." },
      { name: "SIGNING_SECRET", envs: all },
      {
        name: "WEBHOOK_RETRY_LIMIT",
        envs: all,
        tags: ["webhooks"],
        values: { dev: webhookRetryLimit }
      }
    ],
    secrets
  );
  secretsAt(
    "payments-api",
    "/workers",
    [{ name: "QUEUE_CONCURRENCY", envs: ["dev", "staging"] }],
    secrets
  );
  secretsAt("payments-api", "/api/v1", [{ name: "V1_SUNSET_DATE", envs: ["staging"] }], secrets);
  secretsAt(
    "web-dashboard",
    "/",
    [
      { name: "DASHBOARD_URL", envs: all },
      { name: "PUBLIC_API", envs: all },
      { name: "THEME", envs: all }
    ],
    secrets
  );

  const dynamicSecrets = [
    dynamicSecret("/", "dev", "payments-db-readonly"),
    dynamicSecret("/", "staging", "payments-db-readonly"),
    dynamicSecret("/", "dev", "payments-db-reporting"),
    dynamicSecret("/api", "dev", "ledger-db-readonly"),
    dynamicSecret("/api", "prod", "ledger-db-readonly"),
    dynamicSecret("/api", "dev", "refunds-db-writer", {
      status: DynamicSecretStatus.FailedDeletion,
      statusDetails: "The database refused to drop 2 active lease users."
    })
  ];
  return {
    versionHistory: {
      [id("payments-api", "dev", "/", "DATABASE_URL")]: [
        {
          version: 3,
          value: referencingDatabaseUrl,
          createdAt: "2026-10-22T12:06:00Z",
          actor: "Avery Chen",
          actorType: "user"
        },
        {
          version: 2,
          value: "postgres://fake-user:fake-password@db.dev.example.test:5432/payments",
          createdAt: "2026-10-21T16:40:00Z",
          actor: "ci-deployer",
          actorType: "identity"
        },
        {
          version: 1,
          value: "postgres://fake-user:fake-password@localhost:5432/payments",
          createdAt: "2026-10-20T09:00:00Z",
          actor: "Jordan Lee",
          actorType: "user"
        }
      ]
    },
    projects: [
      project("payments-api", "Billing and checkout service"),
      project("web-dashboard", "Customer web application"),
      project("platform-core", "Shared platform services")
    ],
    tags,
    secrets,
    folders: [
      ...folders("payments-api", "/", "api", all),
      ...folders("payments-api", "/", "workers", ["dev", "staging"]),
      ...folders("payments-api", "/api", "v1", all),
      ...folders("payments-api", "/api", "webhooks", ["dev", "prod"])
    ],
    imports: [
      secretImport("/", "dev", { environment: "dev", path: "/workers" }),
      secretImport("/", "dev", { environment: "staging", path: "/api" }),
      secretImport("/", "staging", { environment: "staging", path: "/workers" }),
      secretImport(
        "/",
        "dev",
        { environment: "prod", path: "/api" },
        {
          isReplication: true,
          isReplicationSuccess: true,
          replicationStatus: "succeeded",
          lastReplicated: "2026-10-22T08:00:00Z"
        }
      ),
      secretImport("/api", "dev", { environment: "dev", path: "/workers" }),
      secretImport("/api", "prod", { environment: "staging", path: "/api/v1" })
    ],
    dynamicSecrets,
    leases: seedLeases(dynamicSecrets),
    secretSyncs: seedSecretSyncs(envOf),
    commits: seedDemoCommits(secrets),
    folderAccess: seedFolderAccess(),
    rotations: [
      rotation("/", "dev", "payments-app-db-creds", "payments-postgres", [
        "APP_DB_USERNAME",
        "APP_DB_PASSWORD"
      ]),
      rotation("/api", "prod", "ledger-app-db-creds", "ledger-postgres", [
        "LEDGER_DB_USERNAME",
        "LEDGER_DB_PASSWORD"
      ])
    ],
    honeyTokens: [
      honeyToken("/", "prod", "decoy-aws-keys", [
        "AWS_ACCESS_KEY_ID_LEGACY",
        "AWS_SECRET_ACCESS_KEY_LEGACY"
      ]),
      honeyToken("/api", "dev", "decoy-billing-keys", [
        "BILLING_AWS_ACCESS_KEY_ID",
        "BILLING_AWS_SECRET_ACCESS_KEY"
      ])
    ],
    proxiedServices: [
      proxiedService("/", "prod", "sentry-ingest", "*.ingest.sentry.io", "SENTRY_DSN", {
        headerName: "X-Sentry-Auth",
        headerPrefix: "Sentry sentry_key=",
        isEnabled: false
      }),
      ...["dev", "prod"].map((environment) =>
        proxiedService("/", environment, "stripe-api", "api.stripe.com", "STRIPE_SECRET_KEY", {
          headerName: "Authorization",
          headerPrefix: "Bearer"
        })
      ),
      ...["dev", "staging"].map((environment) =>
        proxiedService(
          "/api",
          environment,
          "ledger-api",
          "ledger.internal.example.test",
          "LEDGER_API_KEY",
          { headerName: "Authorization", headerPrefix: "Bearer" }
        )
      )
    ],
    approvals: [
      approval("smtp", person("Priya", "Raman"), 1, [
        { op: CommitType.DELETE, key: "SMTP_PASSWORD" }
      ]),
      approval("batch", person("Diego", "Alvarez"), 4, [
        { op: CommitType.UPDATE, key: "LOG_LEVEL" },
        { op: CommitType.UPDATE, key: "REDIS_URL" }
      ]),
      approval("webhook", person("Marcus", "Webb"), 7, [
        { op: CommitType.CREATE, key: "STRIPE_WEBHOOK_SECRET" }
      ]),
      approval("stripe", person("Tom", "Becker"), 10, [
        { op: CommitType.UPDATE, key: "STRIPE_API_KEY" }
      ]),
      {
        ...approval("rotate-jwt", person("Jordan", "Lee"), 50, [
          { op: CommitType.UPDATE, key: "JWT_SIGNING_KEY" }
        ]),
        status: "close",
        hasMerged: true,
        reviewers: [
          {
            ...DEMO_USER,
            status: ApprovalStatus.APPROVED,
            comment: "",
            isOrgMembershipActive: true,
            createdAt: new Date(hoursAgo(48))
          }
        ]
      }
    ]
  };
};
