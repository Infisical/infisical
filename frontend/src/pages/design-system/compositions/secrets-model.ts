export type ResourceKind =
  | "folder"
  | "secret"
  | "import"
  | "dynamic"
  | "rotation"
  | "honey"
  | "proxy";
export type ValueState =
  | { status: "present"; value: string }
  | { status: "unreadable" | "loading" }
  | { status: "failed"; message: string };
export type Scope = { project: string; environment: string; path: string };
type ResourceBase = Scope & { id: string; name: string; createdAt: string; updatedAt: string };
export type Secret = ResourceBase & {
  kind: "secret";
  value: ValueState;
  comment: string;
  tags: string[];
  metadata: { key: string; value: string; encrypted: boolean }[];
  version: number;
  override?: string;
  managedBy?: string;
  honeyToken?: boolean;
  reminder?: boolean;
  skipMultilineEncoding?: boolean;
};
export type Resource =
  | Secret
  | (ResourceBase & { kind: "folder"; description: string })
  | (ResourceBase & {
      kind: "import";
      source: Scope;
      revoked: boolean;
      replicated: boolean;
      replicationStatus?: "succeeded" | "failed";
      lastReplicated?: string;
    })
  | (ResourceBase & {
      kind: "dynamic";
      provider: string;
      defaultTTL: string;
      maxTTL?: string;
      status?: "failed-deletion" | "deleting";
    })
  | (ResourceBase & {
      kind: "rotation";
      provider: string;
      connection: string;
      status: "success" | "failed";
      autoRotation: boolean;
      description?: string;
      lastRotatedAt: string;
      nextRotationAt?: string;
      managedKeys: string[];
    })
  | (ResourceBase & {
      kind: "honey";
      provider: string;
      status: "active" | "triggered" | "revoked";
      description: string;
      mappedKeys: string[];
    })
  | (ResourceBase & {
      kind: "proxy";
      host: string;
      enabled: boolean;
      lastUsedAt?: string;
    });
type ResourceDetails = {
  [K in ResourceKind]: Omit<Extract<Resource, { kind: K }>, keyof ResourceBase>;
}[ResourceKind];
export type Scenario =
  | "overview"
  | "compare"
  | "permissions"
  | "loading"
  | "error"
  | "empty"
  | "no-environments"
  | "legacy"
  | "large";
export const scenarios: { value: Scenario; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "compare", label: "Compare environments" },
  { value: "permissions", label: "Permissions" },
  { value: "loading", label: "Loading" },
  { value: "error", label: "Overview error" },
  { value: "empty", label: "Empty project" },
  { value: "no-environments", label: "No environments" },
  { value: "legacy", label: "Legacy engine" },
  { value: "large", label: "Large dataset" }
];
export const projects = [
  { value: "payments-api", label: "payments-api", description: "Billing and checkout service" },
  { value: "web-dashboard", label: "web-dashboard", description: "Customer web application" }
];
export const environments = [
  { value: "dev", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" }
];
export const resourceKinds: { value: ResourceKind; label: string }[] = [
  { value: "folder", label: "Folders" },
  { value: "secret", label: "Secrets" },
  { value: "import", label: "Imports" },
  { value: "dynamic", label: "Dynamic secrets" },
  { value: "rotation", label: "Secret rotations" },
  { value: "honey", label: "Honey tokens" },
  { value: "proxy", label: "Proxied services" }
];
export const scopeMatches = (resource: Scope, scope: Scope) =>
  resource.project === scope.project &&
  resource.environment === scope.environment &&
  resource.path === scope.path;
export const resourceKey = (resource: Resource) => `${resource.kind}:${resource.name}`;
export const readableValue = (secret: Secret) =>
  secret.value.status === "present" ? secret.value.value : undefined;

export const commitCounts: Record<string, number> = {
  "payments-api:dev:/": 12,
  "payments-api:staging:/": 9,
  "payments-api:prod:/": 11,
  "payments-api:dev:/api": 7
};

type SecretSeed = {
  name: string;
  envs: string[];
  empty?: string[];
  comment?: string;
  tags?: string[];
  override?: string;
  managedBy?: string;
  honeyToken?: boolean;
};

export function createResources(scenario: Scenario): Resource[] {
  if (scenario === "empty" || scenario === "no-environments" || scenario === "legacy") return [];
  const resources: Resource[] = [];
  const all = environments.map((environment) => environment.value);
  const add = (scope: Scope, name: string, detail: ResourceDetails) => {
    resources.push({
      ...scope,
      id: `${scope.project}:${scope.environment}:${scope.path}:${detail.kind}:${name}`,
      name,
      createdAt: "2026-10-20T09:00:00Z",
      updatedAt: new Date(Date.UTC(2026, 9, 22, 12, resources.length % 60)).toISOString(),
      ...detail
    } as Resource);
  };
  const at = (environment: string, path = "/", project = "payments-api") => ({
    project,
    environment,
    path
  });
  const secrets = (path: string, seeds: SecretSeed[], project = "payments-api") =>
    seeds.forEach((seed) =>
      seed.envs.forEach((environment) =>
        add(at(environment, path, project), seed.name, {
          kind: "secret",
          value:
            scenario === "permissions" && seed.name === "STRIPE_SECRET_KEY"
              ? { status: "unreadable" }
              : {
                  status: "present",
                  value: seed.empty?.includes(environment)
                    ? ""
                    : `fake-${seed.name.toLowerCase().replace(/_/g, "-")}-${environment}`
                },
          comment: seed.comment ?? "",
          tags: seed.tags ?? [],
          metadata: [],
          version: 1,
          ...(seed.override && environment === "dev" ? { override: seed.override } : {}),
          ...(seed.managedBy ? { managedBy: seed.managedBy } : {}),
          ...(seed.honeyToken ? { honeyToken: true } : {})
        })
      )
    );
  const imports = (path: string, source: Scope, envs: string[]) =>
    envs.forEach((environment) =>
      add(at(environment, path), `${source.environment}:${source.path}`, {
        kind: "import",
        source,
        revoked: false,
        replicated: false
      })
    );

  imports("/", at("dev", "/workers"), ["dev"]);
  imports("/", at("staging", "/api"), ["dev"]);
  imports("/", at("staging", "/workers"), ["staging"]);
  ["api", "workers"].forEach((name) =>
    (name === "api" ? all : ["dev", "staging"]).forEach((environment) =>
      add(at(environment), name, { kind: "folder", description: "" })
    )
  );
  ["dev", "staging"].forEach((environment) =>
    add(at(environment), "payments-db-readonly", {
      kind: "dynamic",
      provider: "SQL Database",
      defaultTTL: "1h",
      maxTTL: "24h"
    })
  );
  add(at("dev"), "payments-db-reporting", {
    kind: "dynamic",
    provider: "SQL Database",
    defaultTTL: "1h",
    maxTTL: "24h"
  });
  add(at("dev"), "payments-app-db-creds", {
    kind: "rotation",
    provider: "PostgreSQL credentials",
    connection: "payments-postgres",
    status: "success",
    autoRotation: true,
    lastRotatedAt: "2026-10-20T00:00:00Z",
    nextRotationAt: "2026-11-24T00:00:00Z",
    managedKeys: ["APP_DB_USERNAME", "APP_DB_PASSWORD"]
  });
  add(at("prod"), "decoy-aws-keys", {
    kind: "honey",
    provider: "AWS",
    status: "active",
    description: "",
    mappedKeys: ["AWS_ACCESS_KEY_ID_LEGACY", "AWS_SECRET_ACCESS_KEY_LEGACY"]
  });
  add(at("prod"), "sentry-ingest", { kind: "proxy", host: "*.ingest.sentry.io", enabled: false });
  ["dev", "prod"].forEach((environment) =>
    add(at(environment), "stripe-api", { kind: "proxy", host: "api.stripe.com", enabled: true })
  );
  secrets("/", [
    { name: "API_BASE_URL", envs: all },
    { name: "APP_DB_PASSWORD", envs: ["dev"], managedBy: "payments-app-db-creds" },
    { name: "APP_DB_USERNAME", envs: ["dev"], managedBy: "payments-app-db-creds" },
    { name: "AWS_ACCESS_KEY_ID_LEGACY", envs: ["prod"], honeyToken: true },
    { name: "AWS_SECRET_ACCESS_KEY_LEGACY", envs: ["prod"], honeyToken: true },
    { name: "CURRENCY_ALLOWLIST", envs: all, empty: ["dev"] },
    { name: "DATABASE_URL", envs: all },
    { name: "FEATURE_FLAGS", envs: all, tags: ["config"] },
    { name: "JWT_SIGNING_KEY", envs: all, override: "fake-personal-jwt-key" },
    { name: "LOG_LEVEL", envs: all, comment: "Raise to debug only while investigating." },
    { name: "REDIS_URL", envs: ["dev", "staging"] },
    { name: "SENTRY_DSN", envs: ["prod"] },
    { name: "STRIPE_SECRET_KEY", envs: ["dev", "prod"] },
    { name: "STRIPE_WEBHOOK_SECRET", envs: all, empty: ["staging"] },
    ...(scenario === "large"
      ? Array.from({ length: 32 }, (_, index) => ({
          name: `DEMO_SETTING_${String(index + 1).padStart(2, "0")}`,
          envs: all
        }))
      : [])
  ]);

  imports("/api", at("dev", "/workers"), ["dev"]);
  imports("/api", at("staging", "/api/v1"), ["prod"]);
  ["v1", "webhooks"].forEach((name) =>
    all.forEach((environment) =>
      add(at(environment, "/api"), name, { kind: "folder", description: "" })
    )
  );
  ["ledger-db-readonly", "refunds-db-writer"].forEach((name) =>
    ["dev", "staging"].forEach((environment) =>
      add(at(environment, "/api"), name, {
        kind: "dynamic",
        provider: "SQL Database",
        defaultTTL: "1h",
        maxTTL: "24h"
      })
    )
  );
  add(at("prod", "/api"), "ledger-app-db-creds", {
    kind: "rotation",
    provider: "PostgreSQL credentials",
    connection: "ledger-postgres",
    status: "success",
    autoRotation: true,
    lastRotatedAt: "2026-10-20T00:00:00Z",
    nextRotationAt: "2026-11-24T00:00:00Z",
    managedKeys: ["LEDGER_DB_USERNAME", "LEDGER_DB_PASSWORD"]
  });
  add(at("dev", "/api"), "decoy-billing-keys", {
    kind: "honey",
    provider: "AWS",
    status: "active",
    description: "",
    mappedKeys: ["BILLING_ACCESS_KEY_ID"]
  });
  all.forEach((environment) =>
    add(at(environment, "/api"), "ledger-api", {
      kind: "proxy",
      host: "ledger.internal.example.test",
      enabled: true
    })
  );
  secrets("/api", [
    { name: "BILLING_ACCESS_KEY_ID", envs: ["dev"], honeyToken: true },
    { name: "CORS_ORIGINS", envs: all },
    { name: "IDEMPOTENCY_TTL_SECONDS", envs: all, empty: ["dev"] },
    { name: "LEDGER_API_KEY", envs: all, override: "fake-personal-ledger-key" },
    { name: "LEDGER_DB_PASSWORD", envs: ["prod"], managedBy: "ledger-app-db-creds" },
    { name: "LEDGER_DB_USERNAME", envs: ["prod"], managedBy: "ledger-app-db-creds" },
    { name: "PAYPAL_CLIENT_ID", envs: all },
    { name: "PAYPAL_CLIENT_SECRET", envs: all, empty: ["staging"] },
    { name: "RATE_LIMIT_PER_MINUTE", envs: all },
    { name: "REFUNDS_QUEUE_URL", envs: ["dev", "staging"] },
    { name: "WEBHOOK_SIGNING_SECRET", envs: all, tags: ["webhooks"] }
  ]);
  secrets("/workers", [{ name: "QUEUE_CONCURRENCY", envs: ["dev", "staging"] }]);
  secrets("/api/v1", [{ name: "V1_SUNSET_DATE", envs: ["staging"] }]);
  secrets(
    "/",
    [
      { name: "DASHBOARD_URL", envs: all },
      { name: "PUBLIC_API", envs: all },
      { name: "THEME", envs: all }
    ],
    "web-dashboard"
  );
  return resources;
}
