// ═══ TYPES ═══════════════════════════════════════════════════════════
export interface DataRow {
  name: string;
  status: string;
  desc: string;
  scope: string;
  date: string;
  resource?: string;
}

export interface StatItem {
  color: string;
  label: string;
  key: string;
  count: number;
}

export interface WidgetFilter {
  resources: string[];
  scopeTypes: string[];
  statuses: string[];
  projectId?: string;
  subOrgIds?: string[];
  scopeMode?: "org" | "suborg" | "project";
}

export interface WidgetTemplate {
  title: string;
  description?: string;
  icon: string;
  iconBg: string;
  borderColor?: string;
  refresh: string;
  stats: StatItem[];
  dataKey: string;
  firstStatus: string;
  isLogs?: boolean;
  filter?: WidgetFilter;
}

export interface LayoutItem {
  uid: string;
  tmpl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
  widgetId?: string;
}

export interface PanelItem {
  id: string;
  tmpl?: string;
  icon: string;
  bg: string;
  name: string;
  desc: string;
  badge: string;
  category: "inf" | "org" | "custom";
  widgetId?: string;
}

export interface SubView {
  id: string;
  name: string;
}

// ═══ RESOURCE TYPES ══════════════════════════════════════════════════
export const RESOURCE_TYPES = [
  { key: "secret-sync", label: "Secret Sync", icon: "RefreshCw", orgOnly: false },
  { key: "secret-rotation", label: "Secret Rotation", icon: "RotateCw", orgOnly: false },
  {
    key: "dynamic-secret-lease",
    label: "Dynamic Secret Lease",
    icon: "Zap",
    orgOnly: false
  },
  {
    key: "machine-identity-token",
    label: "MI Token TTL",
    icon: "Bot",
    orgOnly: false
  },
  { key: "machine-identity-usage", label: "MI Usage", icon: "Activity", orgOnly: false },
  { key: "service-token", label: "Service Token", icon: "Key", orgOnly: false },
  { key: "webhook", label: "Webhook", icon: "Globe", orgOnly: false },
  { key: "pam-session", label: "PAM Session", icon: "Shield", orgOnly: false },
  { key: "user-session", label: "User Session", icon: "Unlock", orgOnly: true },
  { key: "gateway", label: "Gateway", icon: "Server", orgOnly: true },
  { key: "relay", label: "Relay", icon: "Cloud", orgOnly: true },
  { key: "pki-certificate", label: "PKI Certificate", icon: "Lock", orgOnly: false }
] as const;

// ═══ SCOPE TYPES ═════════════════════════════════════════════════════
export const SCOPE_TYPES = [
  { key: "project", label: "Project", color: "#d29922" },
  { key: "org", label: "Organization", color: "#58a6ff" },
  { key: "user", label: "User", color: "#bc8cff" },
  { key: "group", label: "Group", color: "#39d0d8" },
  { key: "mi", label: "Machine Identity", color: "#f0883e" },
  { key: "service_token", label: "Service Token", color: "#8b949e" }
] as const;

// ═══ EVENT TYPES ═════════════════════════════════════════════════════
export const EVENT_TYPES = [
  { key: "active", label: "Active", color: "#3fb950" },
  { key: "failed", label: "Failed", color: "#f85149" },
  { key: "expired", label: "Expired", color: "#d29922" },
  { key: "pending", label: "Pending", color: "#58a6ff" }
] as const;

// ═══ MOCK ORGANIZATIONS ══════════════════════════════════════════════
export const MOCK_SUBORGS = [
  { id: "suborg_platform", name: "Platform Team" },
  { id: "suborg_security", name: "Security Team" },
  { id: "suborg_infra", name: "Infrastructure" }
] as const;

export const MOCK_PROJECTS = [
  { id: "proj_eng", name: "engineering" },
  { id: "proj_root", name: "rootProject" },
  { id: "proj_igor", name: "IgorsSuperDay" }
] as const;

// ═══ UNIFIED MOCK DATA ══════════════════════════════════════════════
const ALL_ROWS: DataRow[] = [
  // secret_sync
  {
    name: "sync-aws-prod",
    status: "failed",
    desc: "InvalidClientTokenId - token rotated but sync config not updated.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-gcp-staging",
    status: "failed",
    desc: "Timeout after 30s - GCP endpoint unreachable.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-vault-eu",
    status: "failed",
    desc: "403 Forbidden - Vault policy denies write on path.",
    scope: "project - IgorsSuperDay",
    date: "02/25/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-aws-staging",
    status: "failed",
    desc: "NoCredentialProviders - instance profile not attached.",
    scope: "project - engineering",
    date: "02/24/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-aws-dev",
    status: "active",
    desc: "Last sync 1.2s - 14 secrets up to date.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-gcp-prod",
    status: "active",
    desc: "Last sync 0.8s - 22 secrets up to date.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-github-actions",
    status: "active",
    desc: "Last sync 0.3s - 8 secrets up to date.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "secret_sync"
  },
  {
    name: "sync-pending-retry",
    status: "pending",
    desc: "Pending retry - back-off after 2 consecutive failures.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "secret_sync"
  },

  // native_integration
  {
    name: "vercel-prod-sync",
    status: "failed",
    desc: "403 Forbidden - Vercel token expired.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "native_integration"
  },
  {
    name: "aws-param-store",
    status: "failed",
    desc: "AccessDeniedException - IAM policy missing ssm:PutParameter.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "native_integration"
  },
  {
    name: "github-actions-sync",
    status: "failed",
    desc: "401 Bad credentials - PAT expired.",
    scope: "project - IgorsSuperDay",
    date: "02/25/2026",
    resource: "native_integration"
  },
  {
    name: "azure-keyvault",
    status: "active",
    desc: "Last sync 2.1s - 9 secrets up to date.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "native_integration"
  },
  {
    name: "heroku-config",
    status: "active",
    desc: "Last sync 1.5s - 4 config vars pushed.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "native_integration"
  },

  // mi_token_ttl
  {
    name: "ci-deployer",
    status: "expired",
    desc: "Token expired 6h ago - all API requests blocked.",
    scope: "mi - engineering",
    date: "02/25/2026",
    resource: "mi_token_ttl"
  },
  {
    name: "prod-k8s-operator",
    status: "expired",
    desc: "Token expired 2h ago - pod restarts failing.",
    scope: "mi - rootProject",
    date: "02/25/2026",
    resource: "mi_token_ttl"
  },
  {
    name: "staging-runner",
    status: "active",
    desc: "Expires in 4h - renewal recommended.",
    scope: "mi - engineering",
    date: "02/25/2026",
    resource: "mi_token_ttl"
  },
  {
    name: "preview-deployer",
    status: "active",
    desc: "Expires in 12h.",
    scope: "mi - engineering",
    date: "02/25/2026",
    resource: "mi_token_ttl"
  },
  {
    name: "dev-cli-igor",
    status: "active",
    desc: "Expires in 6 days.",
    scope: "mi - engineering",
    date: "02/19/2026",
    resource: "mi_token_ttl"
  },
  {
    name: "prod-ci-token",
    status: "pending",
    desc: "Renewal pending approval.",
    scope: "mi - rootProject",
    date: "02/25/2026",
    resource: "mi_token_ttl"
  },

  // webhook
  {
    name: "slack-alerts",
    status: "failed",
    desc: "503 after 3 retries - Slack endpoint degraded.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "webhook"
  },
  {
    name: "datadog-fwd",
    status: "failed",
    desc: "Connection refused - port 443 blocked.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "webhook"
  },
  {
    name: "pagerduty-hook",
    status: "failed",
    desc: "401 Unauthorized - API key expired.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "webhook"
  },
  {
    name: "vercel-webhook",
    status: "active",
    desc: "Last triggered 12s ago - 200 OK.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "webhook"
  },

  // pam_active
  {
    name: "igor-prod-db-1",
    status: "failed",
    desc: "Session terminated - idle timeout exceeded.",
    scope: "org - Admin Org",
    date: "02/25/2026",
    resource: "pam_active"
  },
  {
    name: "alice-staging-db",
    status: "active",
    desc: "Active for 22m - postgres user.",
    scope: "org - Admin Org",
    date: "02/25/2026",
    resource: "pam_active"
  },
  {
    name: "bob-prod-redis",
    status: "active",
    desc: "Active for 5m - redis user.",
    scope: "org - Admin Org",
    date: "02/25/2026",
    resource: "pam_active"
  },

  // latest_login
  {
    name: "unknown@91.108.4.0",
    status: "failed",
    desc: "Invalid credentials - attempt 3/5.",
    scope: "org - Admin Org",
    date: "02/25/2026",
    resource: "latest_login"
  },
  {
    name: "bot@company.io",
    status: "failed",
    desc: "MFA required but not provided.",
    scope: "org - Admin Org",
    date: "02/25/2026",
    resource: "latest_login"
  },
  {
    name: "igor@company.io",
    status: "active",
    desc: "Logged in from 203.0.113.4 (Chrome).",
    scope: "user - igor",
    date: "02/25/2026",
    resource: "latest_login"
  },

  // secret_rotation
  {
    name: "db-password-prod",
    status: "failed",
    desc: "401 Unauthorized - upstream rejected rotation.",
    scope: "project - engineering",
    date: "02/25/2026",
    resource: "secret_rotation"
  },
  {
    name: "api-key-staging",
    status: "active",
    desc: "Rotated successfully - SHA-256 verified.",
    scope: "project - rootProject",
    date: "02/20/2026",
    resource: "secret_rotation"
  },

  // dynamic_secret
  {
    name: "aws-iam-lease-prod",
    status: "failed",
    desc: "IAM quota exceeded - lease provisioning failed.",
    scope: "project - engineering",
    date: "02/23/2026",
    resource: "dynamic_secret"
  },
  {
    name: "pg-lease-staging",
    status: "active",
    desc: "Lease active - 2h remaining.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "dynamic_secret"
  },

  // workflow_integration
  {
    name: "datadog-delivery",
    status: "pending",
    desc: "Delivery delayed 12s - upstream latency spike.",
    scope: "project - engineering",
    date: "02/24/2026",
    resource: "workflow_integration"
  },
  {
    name: "terraform-trigger",
    status: "active",
    desc: "Last triggered 5m ago - 200 OK.",
    scope: "project - rootProject",
    date: "02/25/2026",
    resource: "workflow_integration"
  }
];

const RESOURCE_KEY_MAP: Record<string, string> = {
  "secret-sync": "secret_sync",
  "secret-rotation": "secret_rotation",
  "dynamic-secret-lease": "dynamic_secret",
  "machine-identity-token": "mi_token_ttl",
  "machine-identity-usage": "mi_token_ttl",
  "service-token": "mi_token_ttl",
  "pam-session": "pam_active",
  "user-session": "latest_login",
  "pki-certificate": "secret_rotation"
};

export function queryRows(filter?: WidgetFilter): DataRow[] {
  if (!filter) return ALL_ROWS;
  return ALL_ROWS.filter((row) => {
    if (filter.resources.length > 0) {
      const rowRes = row.resource ?? "";
      const match = filter.resources.some(
        (r) => r === rowRes || RESOURCE_KEY_MAP[r] === rowRes
      );
      if (!match) return false;
    }
    if (filter.statuses.length > 0 && !filter.statuses.includes(row.status)) return false;
    if (filter.scopeTypes.length > 0) {
      const scopePrefix = (row.scope.split(" - ")[0] ?? "").toLowerCase().trim();
      if (!filter.scopeTypes.includes(scopePrefix)) return false;
    }
    if (filter.projectId) {
      const scopeName = (row.scope.split(" - ")[1] ?? "").trim();
      if (scopeName !== filter.projectId) return false;
    }
    return true;
  });
}

export function countByStatus(filter?: WidgetFilter): Record<string, number> {
  const rows = queryRows(filter);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

// ═══ TEMPLATES ════════════════════════════════════════════════════════
export const TEMPLATES: Record<string, WidgetTemplate> = {
  logs: {
    title: "Live Logs",
    description: "Real-time org-wide activity stream",
    icon: "Terminal",
    iconBg: "#1c2a3a",
    refresh: "5s",
    stats: [],
    dataKey: "logs",
    firstStatus: "",
    isLogs: true
  },
  _backend_events: {
    title: "Events",
    description: "",
    icon: "Activity",
    iconBg: "#1c2a3a",
    refresh: "30s",
    stats: [],
    dataKey: "",
    firstStatus: ""
  }
};

// ═══ PANEL ITEMS ═════════════════════════════════════════════════════
export const PANEL_ITEMS: PanelItem[] = [
  {
    id: "logs",
    icon: "Terminal",
    bg: "#1c2a3a",
    name: "Live Logs",
    desc: "Real-time org-wide activity stream.",
    badge: "Infisical",
    category: "inf"
  }
];

// ═══ LOG DATA ════════════════════════════════════════════════════════
export interface LogEntry {
  ts: Date;
  level: "error" | "warn" | "info";
  resource: string;
  actor: string;
  message: string;
}

const LOG_MSGS: Record<string, [string, string][]> = {
  error: [
    ["secret_sync", "Sync to AWS Secrets Manager failed - InvalidClientTokenId"],
    ["secret_sync", "GCP sync timeout after 30s"],
    ["webhook", "POST https://hooks.slack.com returned 503 after 3 retries"],
    ["mi_token_ttl", "Token for prod-k8s-operator expired - all requests blocked"],
    ["secret_rotation", "DB_PASSWORD rotation failed - 401"],
    ["native_integration", "Vercel integration rejected - 403 Forbidden"],
    ["dynamic_secret", "Lease provisioning failed - IAM quota exceeded"],
    ["latest_login", "Failed login from 91.108.4.0 - attempt 3/5"]
  ],
  warn: [
    ["secret_sync", "AWS sync retrying - attempt 2/3 (back-off 30s)"],
    ["mi_token_ttl", "staging-runner token expires in 4h"],
    ["pam_active", "PAM session idle 45m - auto-terminate in 15m"],
    ["workflow_integration", "Datadog delivery delayed 12s"]
  ],
  info: [
    ["secret_sync", "GCP Secret Manager sync completed - 7 secrets updated"],
    ["secret_rotation", "DB_PASSWORD rotated successfully"],
    ["pam_active", "PAM session opened - igor@company.io to prod-db-1"],
    ["mi_token_ttl", "Token renewed - staging-runner, TTL 24h"],
    ["native_integration", "GitHub Actions secrets synced - 4 updates"],
    ["webhook", "Webhook delivered to notify.company.io - 200 OK (138ms)"],
    ["latest_login", "igor@company.io logged in from 203.0.113.4"]
  ]
};

const ACTORS = ["infisical", "igor@company.io", "alice@company.io", "ci-deployer"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateLogEntry(): LogEntry {
  const level = rand(["error", "warn", "info"] as const);
  const msgs = LOG_MSGS[level];
  const pick = rand(msgs);
  return {
    ts: new Date(),
    level,
    resource: pick[0],
    actor: rand(ACTORS),
    message: pick[1]
  };
}

const SEED_BASE = new Date("2026-02-25T12:00:00.000Z");

export function generateSeedLogs(): LogEntry[] {
  const seeds = [
    {
      level: "error" as const,
      resource: "secret_sync",
      actor: "infisical",
      message: "Sync to AWS Secrets Manager failed - InvalidClientTokenId",
      sAgo: 3
    },
    {
      level: "info" as const,
      resource: "pam_active",
      actor: "igor@company.io",
      message: "PAM session opened to prod-db-1 (postgres)",
      sAgo: 8
    },
    {
      level: "warn" as const,
      resource: "mi_token_ttl",
      actor: "infisical",
      message: "Token expiring in 3h 42m - renewal recommended (ci-deployer)",
      sAgo: 15
    },
    {
      level: "error" as const,
      resource: "webhook",
      actor: "infisical",
      message: "POST https://hooks.slack.com returned 503 after 3 retries",
      sAgo: 22
    },
    {
      level: "info" as const,
      resource: "secret_rotation",
      actor: "infisical",
      message: "DB_PASSWORD rotated successfully (SHA-256 verified)",
      sAgo: 34
    },
    {
      level: "warn" as const,
      resource: "secret_sync",
      actor: "infisical",
      message: "AWS sync retrying - attempt 2/3 (back-off 30s)",
      sAgo: 51
    },
    {
      level: "error" as const,
      resource: "dynamic_secret",
      actor: "prod-k8s-operator",
      message: "Lease provisioning failed - IAM quota exceeded",
      sAgo: 67
    },
    {
      level: "info" as const,
      resource: "latest_login",
      actor: "alice@company.io",
      message: "Successful login from 198.51.100.9 (Chrome - macOS)",
      sAgo: 80
    },
    {
      level: "error" as const,
      resource: "latest_login",
      actor: "unknown",
      message: "Failed login from 91.108.4.0 - invalid credentials (attempt 3/5)",
      sAgo: 95
    },
    {
      level: "info" as const,
      resource: "native_integration",
      actor: "infisical",
      message: "GitHub Actions secrets synced - 4 secrets updated",
      sAgo: 112
    },
    {
      level: "warn" as const,
      resource: "pam_active",
      actor: "infisical",
      message: "PAM session idle 45m - auto-terminate in 15m",
      sAgo: 130
    },
    {
      level: "error" as const,
      resource: "secret_rotation",
      actor: "infisical",
      message: "API_KEY rotation failed - upstream returned 401 Unauthorized",
      sAgo: 148
    },
    {
      level: "info" as const,
      resource: "secret_sync",
      actor: "infisical",
      message: "GCP Secret Manager sync completed - 7 secrets updated",
      sAgo: 165
    },
    {
      level: "warn" as const,
      resource: "workflow_integration",
      actor: "infisical",
      message: "Datadog delivery delayed 12s - upstream latency spike",
      sAgo: 183
    },
    {
      level: "info" as const,
      resource: "mi_token_ttl",
      actor: "infisical",
      message: "Token renewed successfully - staging-runner, new TTL 24h",
      sAgo: 200
    }
  ];
  return seeds.map((s) => ({
    ts: new Date(SEED_BASE.getTime() - s.sAgo * 1000),
    level: s.level,
    resource: s.resource,
    actor: s.actor,
    message: s.message
  }));
}

export const PAGE_SIZE = 3;
