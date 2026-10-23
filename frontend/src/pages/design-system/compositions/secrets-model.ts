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
};
export type Resource =
  | Secret
  | (ResourceBase & { kind: "folder"; description: string })
  | (ResourceBase & {
      kind: "import";
      source: Scope;
      revoked: boolean;
      replicated: boolean;
      keys: Record<string, string>;
    })
  | (ResourceBase & {
      kind: "dynamic";
      provider: string;
      leases: { id: string; expiresAt: string; revoked: boolean }[];
    })
  | (ResourceBase & {
      kind: "rotation";
      provider: string;
      status: "succeeded" | "failed";
      managedKeys: string[];
    })
  | (ResourceBase & { kind: "honey"; status: "active" | "detected" | "revoked"; events: string[] })
  | (ResourceBase & { kind: "proxy"; host: string; template: string });
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

export function createResources(scenario: Scenario): Resource[] {
  if (scenario === "empty" || scenario === "no-environments" || scenario === "legacy") return [];
  const resources: Resource[] = [];
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
  projects.forEach((project) => {
    environments.forEach((environment) => {
      const scope = { project: project.value, environment: environment.value, path: "/" };
      const values: Record<string, string> =
        project.value === "payments-api"
          ? {
              API_BASE_URL: "https://api.demo.invalid",
              DATABASE_URL: `postgres://demo.invalid/payments-${environment.value}`,
              DATABASE_REFERENCE: `${"$"}{DATABASE_URL}`,
              EMPTY_VALUE: "",
              TLS_CERTIFICATE: "FAKE CERTIFICATE\nLOCAL DEMONSTRATION ONLY\nNOT VALID FOR TLS",
              SERVICE_CONFIG: '{\n  "service": "payments",\n  "demo": true\n}',
              LOG_LEVEL: "info",
              PAYMENT_PROVIDER_KEY: "fake-provider-value",
              RESTRICTED_VALUE: "fake-restricted-demo"
            }
          : {
              DASHBOARD_URL: "https://dashboard.demo.invalid",
              THEME: "system",
              PUBLIC_API: "https://web.demo.invalid"
            };
      if (scenario === "large")
        for (let i = 1; i <= 32; i += 1)
          values[`DEMO_SETTING_${String(i).padStart(2, "0")}`] = `fake-value-${i}`;
      Object.entries(values).forEach(([name, value]) => {
        if (
          (name === "DATABASE_URL" && environment.value === "prod") ||
          (name === "EMPTY_VALUE" && environment.value === "staging")
        )
          return;
        const tags = [];
        if (name.includes("DATABASE")) tags.push("database");
        if (name === "PAYMENT_PROVIDER_KEY") tags.push("billing");
        add(scope, name, {
          kind: "secret",
          value:
            name === "RESTRICTED_VALUE" ? { status: "unreadable" } : { status: "present", value },
          comment:
            name === "PAYMENT_PROVIDER_KEY"
              ? "Fake provider configuration for the checkout service."
              : "",
          tags,
          metadata:
            name === "PAYMENT_PROVIDER_KEY"
              ? [
                  { key: "owner", value: "payments", encrypted: false },
                  { key: "note", value: "fake-private-note", encrypted: true }
                ]
              : [],
          version: 1,
          ...(name === "LOG_LEVEL" && environment.value === "dev" ? { override: "debug" } : {})
        });
      });
      if (project.value !== "payments-api") return;
      add(scope, "billing", { kind: "folder", description: "Billing integrations" });
      add(scope, "shared", { kind: "folder", description: "Shared configuration" });
      add({ ...scope, path: "/billing" }, "webhooks", {
        kind: "folder",
        description: "Webhook receivers"
      });
      add({ ...scope, path: "/billing" }, "WEBHOOK_URL", {
        kind: "secret",
        value: { status: "present", value: "https://hooks.demo.invalid" },
        comment: "",
        tags: ["billing"],
        metadata: [],
        version: 1
      });
      add(scope, "shared-config", {
        kind: "import",
        source: { ...scope, path: "/shared" },
        revoked: false,
        replicated: false,
        keys: { REGION: "demo-west", LOG_LEVEL: "warn" }
      });
      Object.entries({ REGION: "demo-west", LOG_LEVEL: "warn" }).forEach(([name, value]) => {
        add({ ...scope, path: "/shared" }, name, {
          kind: "secret",
          value: { status: "present", value },
          comment: "",
          tags: [],
          metadata: [],
          version: 1
        });
      });
      ["DB_USERNAME", "DB_PASSWORD"].forEach((name) => {
        add(scope, name, {
          kind: "secret",
          value: { status: "present", value: `fake-${name.toLowerCase()}` },
          comment: "",
          tags: ["database"],
          metadata: [],
          version: 1,
          managedBy: "billing-db-rotation"
        });
      });
      add(scope, "orders-readonly", { kind: "dynamic", provider: "SQL Database", leases: [] });
      add(scope, "billing-db-rotation", {
        kind: "rotation",
        provider: "PostgreSQL",
        status: "succeeded",
        managedKeys: ["DB_USERNAME", "DB_PASSWORD"]
      });
      add(scope, "audit-canary", { kind: "honey", status: "active", events: [] });
      add(scope, "billing-api-proxy", {
        kind: "proxy",
        host: "*.billing.demo.invalid",
        template: "Custom HTTP"
      });
    });
  });
  return resources;
}
