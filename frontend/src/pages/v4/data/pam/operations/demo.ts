import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  PamAccountType,
  PamDiscoverySchedule,
  PamDiscoveryType,
  PamOutputMaskingPreset,
  PamPolicyType,
  PamRotationStatus,
  PamSessionStatus,
  type TPamAccountTemplateDetail,
  type TPamAccountTemplateWithCount,
  type TPamDiscoveredAccount,
  type TPamDiscoveryRun,
  type TPamDiscoverySource,
  type TPamDiscoveryTypeOption,
  type TPamPolicyDescriptor,
  type TPamSession,
  type TPamSessionLog,
  type TPamStaleAccount
} from "@app/hooks/api/pam";

import { DEMO_PAM_PROJECT_ID } from "../../access/fixtures";
import { createFixtureStore, fixtureMutation } from "../../fixture-store";
import type { PamOperationsAdapter, TPamPageParams } from "./contract";

const uuid = (prefix: string, index: number) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const account = (index: number) => uuid("a0", index);
const folder = (index: number) => uuid("f0", index);
const loadedAt = Date.now();
const ago = (minutes: number) => new Date(loadedAt - minutes * 60_000).toISOString();
const HOUR = 60;
const GATEWAY_US = "3f9a2c71-8e4b-4d15-a6c0-5b7e1d2f8a93";
const GATEWAY_EU = "b81d4e06-2c9f-47a3-9e5b-0f6a3c8d1e27";
const DAY = 24 * HOUR;

const SQL_TYPES = [
  PamAccountType.Postgres,
  PamAccountType.CockroachDB,
  PamAccountType.MySQL,
  PamAccountType.MsSQL,
  PamAccountType.OracleDB,
  PamAccountType.Snowflake,
  PamAccountType.ClickHouse
];

export const demoApplicablePolicies = (type: PamAccountType): TPamPolicyDescriptor[] => [
  {
    key: PamPolicyType.RequiresApproval,
    label: "Require Approval",
    description:
      "Users must request and receive approval before launching sessions and viewing credentials."
  },
  {
    key: PamPolicyType.AllowAutoApproval,
    label: "Allow Auto-Approval",
    description:
      "Requests are approved instantly when they pass one of the folder's auto-approval rules. Set the rules under the folder's Approvals tab."
  },
  {
    key: PamPolicyType.AllowBreakGlass,
    label: "Allow Break-Glass",
    description:
      "Designated break-glass users can grant themselves access in an emergency, without an approver. Has no effect until a folder admin names them under the folder's Approvals tab."
  },
  {
    key: PamPolicyType.RequireMfa,
    label: "Require MFA",
    description: "Users must re-authenticate with MFA before accessing."
  },
  {
    key: PamPolicyType.RequireReason,
    label: "Require Reason",
    description: "Users must provide a reason before accessing."
  },
  {
    key: PamPolicyType.MaxSessionDuration,
    label: "Max Session Duration",
    description:
      type === PamAccountType.AwsIam
        ? "Maximum session length in seconds (900 to 3600)."
        : "Maximum session length in seconds (60 to 86400)."
  },
  ...([PamAccountType.SSH, PamAccountType.Snowflake, PamAccountType.ClickHouse].includes(type)
    ? [
        {
          key: PamPolicyType.CommandBlocking,
          label: "Command Blocking",
          description:
            type === PamAccountType.SSH
              ? "Matching commands will be rejected (one regex per line)."
              : "Matching SQL statements will be rejected (one regex per line)."
        }
      ]
    : []),
  ...([...SQL_TYPES, PamAccountType.MongoDB, PamAccountType.SSH].includes(type)
    ? [
        {
          key: PamPolicyType.OutputMasking,
          label: "Output Masking",
          description: "Matching values are masked in query results and terminal output."
        }
      ]
    : [])
];

type TemplateSeed = {
  type: PamAccountType;
  name: string;
  description?: string;
  accounts: number;
  policies?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  gateway?: boolean;
  recording?: boolean;
};

const rotation = (enabled: boolean, intervalSeconds = 86400) => ({
  rotation: { enabled, intervalSeconds: enabled ? intervalSeconds : null },
  passwordRequirements: {
    length: 32,
    required: { uppercase: 2, lowercase: 2, digits: 2, symbols: 1 },
    allowedSymbols: "-_.~!*"
  }
});
const heartbeat = (enabled: boolean) => ({
  heartbeat: { enabled, intervalSeconds: enabled ? 86400 : null }
});
const s3 = {
  recordingStorageBackend: "aws-s3",
  recordingS3Config: { bucket: "acme-pam-recordings", region: "us-east-1", keyPrefix: "prod/" }
};

const templateSeeds: TemplateSeed[] = [
  {
    type: PamAccountType.Postgres,
    name: "production-postgres",
    description: "Customer-facing PostgreSQL clusters",
    accounts: 3,
    policies: {
      [PamPolicyType.RequiresApproval]: true,
      [PamPolicyType.AllowAutoApproval]: true,
      [PamPolicyType.RequireMfa]: true,
      [PamPolicyType.MaxSessionDuration]: 3600,
      [PamPolicyType.OutputMasking]: {
        presets: [
          PamOutputMaskingPreset.AccountCredentials,
          PamOutputMaskingPreset.Email,
          PamOutputMaskingPreset.CreditCard
        ],
        patterns: "acme_[a-z0-9]{24}"
      }
    },
    settings: {
      ...rotation(true, 604800),
      ...heartbeat(true),
      ...s3,
      sessionLogMaskingBuiltInDetection: true
    },
    gateway: true,
    recording: true
  },
  {
    type: PamAccountType.MySQL,
    name: "billing-mysql",
    accounts: 1,
    policies: { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.RequireReason]: true },
    settings: { ...rotation(false), ...heartbeat(true) },
    gateway: true
  },
  {
    type: PamAccountType.MsSQL,
    name: "sql-server",
    description: "Ledger and AP databases",
    accounts: 2,
    policies: { [PamPolicyType.RequireMfa]: true },
    settings: { ...rotation(true), ...heartbeat(false) },
    gateway: true
  },
  {
    type: PamAccountType.OracleDB,
    name: "oracle-reporting",
    accounts: 2,
    settings: {
      rotation: { enabled: false, intervalSeconds: null },
      passwordRequirements: {
        length: 24,
        required: { uppercase: 1, lowercase: 1, digits: 1, symbols: 1 }
      }
    },
    gateway: true
  },
  {
    type: PamAccountType.MongoDB,
    name: "catalog-mongo",
    accounts: 1,
    policies: { [PamPolicyType.MaxSessionDuration]: 1800 },
    gateway: true
  },
  {
    type: PamAccountType.Redis,
    name: "cache-redis",
    accounts: 1,
    settings: { ...heartbeat(true), sessionLogMaskingPatterns: "AUTH\\s+\\S+" },
    gateway: true
  },
  {
    type: PamAccountType.Snowflake,
    name: "warehouse-snowflake",
    description: "Analytics warehouse loaders",
    accounts: 1,
    policies: {
      [PamPolicyType.CommandBlocking]: "^\\s*drop\\b\n\\btruncate\\b",
      [PamPolicyType.RequireReason]: true
    },
    gateway: true
  },
  {
    type: PamAccountType.ClickHouse,
    name: "events-clickhouse",
    accounts: 1,
    policies: { [PamPolicyType.CommandBlocking]: "^\\s*grant\\b" },
    gateway: true
  },
  {
    type: PamAccountType.SSH,
    name: "linux-bastions",
    description: "Jump hosts and build runners",
    accounts: 4,
    policies: {
      [PamPolicyType.RequireMfa]: true,
      [PamPolicyType.CommandBlocking]: "rm\\s+-rf\\s+/\nshutdown\\b",
      [PamPolicyType.MaxSessionDuration]: 7200
    },
    settings: { ...heartbeat(true), ...s3, sessionLogMaskingBuiltInDetection: true },
    gateway: true,
    recording: true
  },
  {
    type: PamAccountType.Kubernetes,
    name: "kubernetes-prod",
    accounts: 3,
    policies: { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.AllowBreakGlass]: true },
    gateway: true
  },
  {
    type: PamAccountType.GcpServiceAccount,
    name: "gcp-service-accounts",
    accounts: 1,
    gateway: true
  },
  {
    type: PamAccountType.Windows,
    name: "rdp-hosts",
    accounts: 1,
    settings: { ...rotation(true, 2592000), ...s3 },
    gateway: true,
    recording: true
  },
  {
    type: PamAccountType.WindowsAd,
    name: "corp-domain",
    description: "Domain administrators for corp.acme.internal",
    accounts: 1,
    policies: { [PamPolicyType.RequiresApproval]: true, [PamPolicyType.RequireMfa]: true },
    settings: { ...rotation(true, 2592000), ...heartbeat(true) },
    gateway: true
  },
  {
    type: PamAccountType.AwsIam,
    name: "aws-break-glass",
    description: "Organization admin roles, approval required",
    accounts: 1,
    policies: {
      [PamPolicyType.RequiresApproval]: true,
      [PamPolicyType.AllowBreakGlass]: true,
      [PamPolicyType.MaxSessionDuration]: 3600
    }
  },
  { type: PamAccountType.AzureCli, name: "azure-operators", accounts: 1, gateway: true },
  {
    type: PamAccountType.Postgres,
    name: "contractor-postgres",
    description: "Time-boxed access for external engineers on staging",
    accounts: 0,
    policies: {
      [PamPolicyType.RequireReason]: true,
      [PamPolicyType.MaxSessionDuration]: 900
    },
    settings: { ...rotation(false), ...heartbeat(false) }
  },
  {
    type: PamAccountType.SSH,
    name: "ssh-ephemeral-build-runners-us-east-1-and-eu-west-1-shared-pool",
    description:
      "Short-lived runners recycled every few hours by the platform team, scanned weekly by discovery",
    accounts: 0
  }
];

const templateDetails: TPamAccountTemplateDetail[] = templateSeeds.map((seed, index) => ({
  id: uuid("e0", index + 1),
  name: seed.name,
  description: seed.description ?? null,
  type: seed.type,
  policies: seed.policies ?? {},
  settings: seed.settings ?? {},
  gatewayId: seed.gateway ? GATEWAY_US : null,
  gatewayPoolId: null,
  recordingConnectionId: seed.recording ? uuid("c1", 1) : null,
  accountCount: seed.accounts,
  rotationImpact: {
    willRotate: Math.max(0, seed.accounts - 1),
    needsRotationAccount: seed.accounts > 0 ? 1 : 0
  },
  createdAt: ago(DAY * (120 - index * 3)),
  updatedAt: ago(HOUR * (index * 7 + 3))
}));

const toListItem = ({ rotationImpact, ...template }: TPamAccountTemplateDetail) => template;

const templateDetailStore = createFixtureStore(templateDetails);
export const templateStore = createFixtureStore<TPamAccountTemplateWithCount[]>(
  templateDetails.map(toListItem)
);

const writeTemplates = (
  change: (current: TPamAccountTemplateDetail[]) => TPamAccountTemplateDetail[]
) => {
  templateDetailStore.update(change);
  templateStore.update(() => templateDetailStore.get().map(toListItem));
};

const discoveryTypes: TPamDiscoveryTypeOption[] = [
  {
    type: PamDiscoveryType.ActiveDirectory,
    name: "Active Directory",
    icon: "ActiveDirectory.png",
    credentialAccountType: PamAccountType.WindowsAd
  },
  {
    type: PamDiscoveryType.Unix,
    name: "Linux/Unix",
    icon: "SSH.png",
    credentialAccountType: PamAccountType.SSH
  },
  {
    type: PamDiscoveryType.Postgres,
    name: "PostgreSQL",
    icon: "Postgres.png",
    credentialAccountType: PamAccountType.Postgres
  },
  {
    type: PamDiscoveryType.MsSQL,
    name: "Microsoft SQL Server",
    icon: "MsSql.png",
    credentialAccountType: PamAccountType.MsSQL
  }
];

const sourceId = (index: number) => uuid("d0", index);

const sources: TPamDiscoverySource[] = [
  {
    id: sourceId(1),
    projectId: DEMO_PAM_PROJECT_ID,
    name: "corp-domain",
    discoveryType: PamDiscoveryType.ActiveDirectory,
    gatewayId: GATEWAY_US,
    gatewayPoolId: null,
    credentialAccountId: account(16),
    discoveryConfiguration: {
      scanLocalAccounts: true,
      discoverDependencies: true,
      winrmPort: 5986,
      useWinrmHttps: true,
      winrmRejectUnauthorized: true
    },
    schedule: PamDiscoverySchedule.Daily,
    lastRunAt: ago(HOUR * 5),
    lastRunStatus: "completed",
    lastRunError: null,
    createdAt: ago(DAY * 60),
    updatedAt: ago(HOUR * 5)
  },
  {
    id: sourceId(2),
    projectId: DEMO_PAM_PROJECT_ID,
    name: "linux-fleet",
    discoveryType: PamDiscoveryType.Unix,
    gatewayId: GATEWAY_EU,
    gatewayPoolId: null,
    credentialAccountId: account(18),
    discoveryConfiguration: {
      cidrRanges: ["10.20.0.0/24", "10.20.4.15", "build-01.internal"],
      credentialAccountIds: [account(18), account(20)]
    },
    schedule: PamDiscoverySchedule.Weekly,
    lastRunAt: ago(DAY * 2),
    lastRunStatus: "failed",
    lastRunError: "Gateway linux-gw-2 could not reach 10.20.0.0/24: connection timed out",
    createdAt: ago(DAY * 40),
    updatedAt: ago(DAY * 2)
  },
  {
    id: sourceId(3),
    projectId: DEMO_PAM_PROJECT_ID,
    name: "postgres-production-hosts",
    discoveryType: PamDiscoveryType.Postgres,
    gatewayId: GATEWAY_US,
    gatewayPoolId: null,
    credentialAccountId: account(1),
    discoveryConfiguration: {
      hosts: ["orders-db-1.internal", "orders-db-2.internal", "10.30.1.12"],
      credentialAccountIds: [account(1)]
    },
    schedule: PamDiscoverySchedule.Manual,
    lastRunAt: ago(25),
    lastRunStatus: "completed",
    lastRunError: null,
    createdAt: ago(DAY * 12),
    updatedAt: ago(25)
  },
  {
    id: sourceId(4),
    projectId: DEMO_PAM_PROJECT_ID,
    name: "finance-sql-legacy",
    discoveryType: PamDiscoveryType.MsSQL,
    gatewayId: GATEWAY_US,
    gatewayPoolId: null,
    credentialAccountId: account(23),
    discoveryConfiguration: {
      hosts: ["ap-sql-01.finance.internal"],
      credentialAccountIds: [account(23)]
    },
    schedule: PamDiscoverySchedule.Manual,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    createdAt: ago(HOUR * 3),
    updatedAt: ago(HOUR * 3)
  }
];

const run = (
  source: number,
  index: number,
  minutesAgo: number,
  overrides: Partial<TPamDiscoveryRun> = {}
): TPamDiscoveryRun => ({
  id: uuid(`b${source}`, index),
  discoverySourceId: sourceId(source),
  status: "completed",
  triggeredBy: "schedule",
  discoveredCount: 0,
  newCount: 0,
  startedAt: ago(minutesAgo),
  completedAt: ago(minutesAgo - 3),
  createdAt: ago(minutesAgo),
  ...overrides
});

const runs: TPamDiscoveryRun[] = [
  run(1, 1, HOUR * 5, {
    discoveredCount: 34,
    newCount: 3,
    dependencyCount: 58,
    newDependencyCount: 4,
    machineErrors: [
      {
        machine: "FS-ARCHIVE-02.corp.acme.internal",
        error: "WinRM refused the connection on port 5986"
      },
      { machine: "PRINT-01.corp.acme.internal", error: "Access is denied" }
    ]
  }),
  run(1, 2, HOUR * 29, {
    discoveredCount: 31,
    newCount: 0,
    dependencyCount: 54,
    newDependencyCount: 0
  }),
  run(1, 3, HOUR * 53, {
    discoveredCount: 31,
    newCount: 31,
    dependencyCount: 54,
    newDependencyCount: 54
  }),
  run(2, 1, DAY * 2 * 1, {
    status: "failed",
    errorMessage:
      "Gateway linux-gw-2 could not reach 10.20.0.0/24: connection timed out\nNo hosts were scanned.",
    completedAt: ago(DAY * 2 - 1)
  }),
  run(2, 2, DAY * 9, { discoveredCount: 12, newCount: 12 }),
  run(3, 1, 25, { triggeredBy: "manual", discoveredCount: 7, newCount: 2 })
];

const windowsNames = [
  "Administrator",
  "svc-backup",
  "svc-sql-agent",
  "svc-iis-apppool",
  "svc-exchange",
  "svc-sharepoint-farm",
  "jdoe-admin",
  "asmith-admin",
  "helpdesk-tier2",
  "svc-scheduler",
  "svc-monitoring",
  "krbtgt-recovery",
  "svc-print-spooler",
  "svc-azure-ad-connect",
  "svc-veeam",
  "svc-citrix-delivery",
  "lab-local-admin",
  "svc-adfs",
  "svc-wsus",
  "svc-sccm-network-access",
  "svc-reporting-services",
  "svc-dynamics-crm-async-processing-long-name",
  "temp-contractor-01",
  "svc-hyperv-replica"
];

const discovered: Record<string, TPamDiscoveredAccount[]> = {
  [sourceId(1)]: windowsNames.map((name, index) => ({
    id: uuid("d1", index + 1),
    accountType: index % 5 === 0 ? PamAccountType.Windows : PamAccountType.WindowsAd,
    name: index % 5 === 0 ? `DC0${(index % 3) + 1}\\${name}` : `CORP\\${name}`,
    fingerprint: `fp-${index}`,
    createdAt: ago(HOUR * 5),
    dependencyCount: index % 3 === 0 ? 0 : (index % 4) + 1,
    dependencies: []
  })),
  [sourceId(2)]: ["deploy", "ubuntu", "ec2-user", "jenkins", "postgres", "backup"].map(
    (name, index) => ({
      id: uuid("d2", index + 1),
      accountType: PamAccountType.SSH,
      name: `${name}@10.20.0.${index + 11}`,
      fingerprint: `fp-ssh-${index}`,
      createdAt: ago(DAY * 9),
      dependencyCount: 0,
      dependencies: []
    })
  ),
  [sourceId(3)]: ["orders_app", "orders_readonly", "replicator", "analytics_etl", "pgbouncer"].map(
    (name, index) => ({
      id: uuid("d3", index + 1),
      accountType: PamAccountType.Postgres,
      name: `${name}@orders-db-${(index % 2) + 1}.internal`,
      fingerprint: `fp-pg-${index}`,
      createdAt: ago(25),
      dependencyCount: 0,
      dependencies: []
    })
  )
};

const stale: Record<string, TPamStaleAccount[]> = {
  [sourceId(1)]: [
    {
      id: uuid("d5", 1),
      accountId: account(16),
      name: "dc01-administrator",
      folderId: folder(5),
      folderName: "windows-fleet",
      accountType: PamAccountType.WindowsAd,
      lastDiscoveredAt: ago(DAY * 6)
    },
    {
      id: uuid("d5", 2),
      accountId: account(17),
      name: "rdp-jumpbox",
      folderId: folder(5),
      folderName: "windows-fleet",
      accountType: PamAccountType.Windows,
      lastDiscoveredAt: ago(DAY * 15)
    }
  ],
  [sourceId(3)]: [
    {
      id: uuid("d5", 3),
      accountId: account(21),
      name: "contractor-staging-db",
      folderId: folder(7),
      folderName: "contractors",
      accountType: PamAccountType.Postgres,
      lastDiscoveredAt: null
    }
  ]
};

const sourceStore = createFixtureStore(sources);
const runStore = createFixtureStore(runs);
const discoveredStore = createFixtureStore(discovered);
const staleStore = createFixtureStore(stale);

const page = <T extends { name: string }>(rows: T[], params?: TPamPageParams) => {
  const search = params?.search?.trim().toLowerCase();
  const matching = search ? rows.filter((row) => row.name.toLowerCase().includes(search)) : rows;
  const offset = params?.offset ?? 0;
  return {
    rows: matching.slice(offset, offset + (params?.limit ?? matching.length)),
    totalCount: matching.length
  };
};

const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

const sqlLogs = (minutesAgo: number, entries: [string, string][]): TPamSessionLog[] =>
  entries.map(([input, output], index) => ({
    input,
    output,
    timestamp: ago(minutesAgo - index * 0.4)
  }));

const terminalLogs = (minutesAgo: number, lines: string[]): TPamSessionLog[] =>
  lines.map((line, index) => ({
    timestamp: ago(minutesAgo - index * 0.3),
    eventType: index % 2 === 0 ? "input" : "output",
    data: encode(line),
    rendered: true,
    elapsedTime: index * 18
  }));

type SessionSeed = {
  account: number;
  name: string;
  type: PamAccountType;
  folder?: number;
  folderName?: string;
  actor: [string, string] | null;
  status: PamSessionStatus;
  startedMinutesAgo: number;
  durationMinutes?: number;
  reason?: string;
  ip: string;
  logs?: TPamSessionLog[];
};

const sessionSeeds: SessionSeed[] = [
  {
    account: 1,
    name: "orders-primary",
    type: PamAccountType.Postgres,
    folder: 1,
    folderName: "production-databases",
    actor: ["Maya Chen", "maya@acme.dev"],
    status: PamSessionStatus.Active,
    startedMinutesAgo: 14,
    reason: "INC-2231 investigate stuck order exports",
    ip: "203.0.113.24",
    logs: sqlLogs(14, [
      ["SELECT id, status, updated_at FROM orders WHERE status = 'exporting' LIMIT 20;", "20 rows"],
      ["SELECT count(*) FROM export_jobs WHERE finished_at IS NULL;", "count\n-------\n 418"],
      [
        "EXPLAIN ANALYZE SELECT * FROM export_jobs WHERE finished_at IS NULL;",
        "Seq Scan on export_jobs (cost=0.00..1834.22 rows=418)"
      ],
      ["UPDATE export_jobs SET retry_count = 0 WHERE id = 99812;", "UPDATE 1"]
    ])
  },
  {
    account: 18,
    name: "bastion-ops",
    type: PamAccountType.SSH,
    folder: 6,
    folderName: "linux-bastions",
    actor: ["Jordan Patel", "jordan@acme.dev"],
    status: PamSessionStatus.Active,
    startedMinutesAgo: 47,
    ip: "198.51.100.7",
    logs: terminalLogs(47, [
      "sudo systemctl status nginx",
      "nginx.service - A high performance web server\n   Active: active (running) since Mon 2026-11-09 08:12:44 UTC",
      "tail -n 3 /var/log/nginx/error.log",
      "2026/11/15 09:01:12 [warn] upstream response is buffered to a temporary file",
      "df -h /var",
      "Filesystem  Size  Used Avail Use% Mounted on\n/dev/nvme1n1  50G   41G  9.0G  82% /var"
    ])
  },
  {
    account: 3,
    name: "billing-admin",
    type: PamAccountType.MySQL,
    folder: 1,
    folderName: "production-databases",
    actor: ["Priya Raman", "priya@acme.dev"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 3,
    durationMinutes: 22,
    reason: "Monthly invoice reconciliation",
    ip: "203.0.113.51",
    logs: sqlLogs(HOUR * 3, [
      ["SHOW TABLES;", "invoices\ninvoice_lines\npayments\nrefunds"],
      [
        "SELECT SUM(amount_cents) FROM payments WHERE created_at >= '2026-10-01';",
        "SUM(amount_cents)\n4829117200"
      ],
      [
        "DELETE FROM invoice_drafts WHERE created_at < '2026-01-01';",
        "Query OK, 1204 rows affected"
      ]
    ])
  },
  {
    account: 10,
    name: "prod-us-east-1",
    type: PamAccountType.Kubernetes,
    folder: 3,
    folderName: "kubernetes-clusters",
    actor: ["deploy-bot", ""],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 5,
    durationMinutes: 4,
    ip: "10.0.12.4",
    logs: [
      {
        timestamp: ago(HOUR * 5),
        requestId: "req-1",
        eventType: "request",
        headers: {},
        method: "GET",
        url: "/api/v1/namespaces/payments/pods"
      },
      {
        timestamp: ago(HOUR * 5 - 0.1),
        requestId: "req-1",
        eventType: "response",
        headers: {},
        status: "200 OK",
        body: encode(
          JSON.stringify({ kind: "PodList", items: [{ metadata: { name: "payments-api-7f9c" } }] })
        )
      },
      {
        timestamp: ago(HOUR * 5 - 1),
        requestId: "req-2",
        eventType: "request",
        headers: {},
        method: "PATCH",
        url: "/apis/apps/v1/namespaces/payments/deployments/payments-api",
        body: encode(JSON.stringify({ spec: { replicas: 6 } }))
      },
      {
        timestamp: ago(HOUR * 5 - 1.1),
        requestId: "req-2",
        eventType: "response",
        headers: {},
        status: "200 OK"
      }
    ]
  },
  {
    account: 7,
    name: "warehouse-loader",
    type: PamAccountType.Snowflake,
    folder: 2,
    folderName: "analytics",
    actor: ["Sam Okafor", "sam@acme.dev"],
    status: PamSessionStatus.Terminated,
    startedMinutesAgo: HOUR * 9,
    durationMinutes: 3,
    reason: "Backfill October revenue",
    ip: "192.0.2.80",
    logs: sqlLogs(HOUR * 9, [
      ["USE WAREHOUSE LOADER_WH;", "Statement executed successfully."],
      ["TRUNCATE TABLE revenue_daily;", "Blocked by policy: matches ^\\btruncate\\b"]
    ])
  },
  {
    account: 17,
    name: "rdp-jumpbox",
    type: PamAccountType.Windows,
    folder: 5,
    folderName: "windows-fleet",
    actor: ["Elena Garcia", "elena@acme.dev"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 26,
    durationMinutes: 61,
    ip: "203.0.113.90"
  },
  {
    account: 4,
    name: "ledger-sa",
    type: PamAccountType.MsSQL,
    folder: 1,
    folderName: "production-databases",
    actor: ["Maya Chen", "maya@acme.dev"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 30,
    durationMinutes: 12,
    ip: "203.0.113.24",
    logs: sqlLogs(HOUR * 30, [
      ["SELECT TOP 10 * FROM dbo.Journal ORDER BY PostedAt DESC;", "10 rows affected"],
      [
        "ALTER TABLE dbo.Journal ADD ReviewedBy NVARCHAR(64) NULL;",
        "Commands completed successfully."
      ]
    ])
  },
  {
    account: 19,
    name: "bastion-deploy",
    type: PamAccountType.SSH,
    folder: 6,
    folderName: "linux-bastions",
    actor: ["ci-release-pipeline", ""],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 31,
    durationMinutes: 2,
    ip: "10.0.40.18",
    logs: terminalLogs(HOUR * 31, [
      "./deploy.sh --env production --version 4.18.2",
      "Deploying 4.18.2 to 12 hosts... done"
    ])
  },
  {
    account: 13,
    name: "aws-org-admin",
    type: PamAccountType.AwsIam,
    folder: 4,
    folderName: "cloud-consoles",
    actor: ["Alex Morgan-Whitfield-Ramirez", "alex.morgan-whitfield-ramirez@contractors.acme.dev"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 50,
    durationMinutes: 58,
    reason:
      "Break-glass: rotate compromised CI role trust policy after the SEC-118 alert fired overnight",
    ip: "2001:db8:85a3::8a2e:370:7334"
  },
  {
    account: 22,
    name: "contractor-ssh",
    type: PamAccountType.SSH,
    folder: 7,
    folderName: "contractors",
    actor: ["Lee Wong", "lee@partner.example"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 72,
    durationMinutes: 140,
    ip: "198.51.100.33",
    logs: terminalLogs(HOUR * 72, [
      "ls -la /srv/app",
      "total 12\ndrwxr-xr-x 3 app app 4096 Nov 12 10:01 ."
    ])
  },
  {
    account: 9,
    name: "reporting-oracle",
    type: PamAccountType.OracleDB,
    folder: 2,
    folderName: "analytics",
    actor: ["Priya Raman", "priya@acme.dev"],
    status: PamSessionStatus.Starting,
    startedMinutesAgo: 0,
    ip: "203.0.113.51"
  },
  {
    account: 5,
    name: "sessions-cache",
    type: PamAccountType.Redis,
    folder: 1,
    folderName: "production-databases",
    actor: ["Jordan Patel", "jordan@acme.dev"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 96,
    durationMinutes: 6,
    ip: "198.51.100.7",
    logs: sqlLogs(HOUR * 96, [
      ["INFO memory", "used_memory_human:2.41G"],
      ["SCAN 0 MATCH session:* COUNT 100", '1) "3312"\n2) 1) "session:9f2c"']
    ])
  },
  {
    account: 24,
    name: "payroll-oracle",
    type: PamAccountType.OracleDB,
    folder: 8,
    folderName: "finance-legacy",
    actor: ["Sam Okafor", "sam@acme.dev"],
    status: PamSessionStatus.Ended,
    startedMinutesAgo: HOUR * 140,
    durationMinutes: 9,
    ip: "192.0.2.80"
  }
];

const sessionLogs = new Map<string, TPamSessionLog[]>();
const sessions: TPamSession[] = sessionSeeds.map((seed, index) => {
  const id = uuid("5e", index + 1);
  sessionLogs.set(id, seed.logs ?? []);
  const isMachine = !seed.actor?.[1];
  const started = seed.status === PamSessionStatus.Starting ? null : ago(seed.startedMinutesAgo);
  return {
    id,
    accountId: account(seed.account),
    accountType: seed.type,
    accountName: seed.name,
    folderId: seed.folder ? folder(seed.folder) : null,
    folderName: seed.folderName ?? null,
    userId: isMachine ? null : uuid("70", index + 1),
    identityId: isMachine ? uuid("71", index + 1) : null,
    actorName: seed.actor?.[0] ?? "Deleted identity",
    actorEmail: seed.actor?.[1] ?? "",
    actorIp: seed.ip,
    actorUserAgent: "infisical-cli/0.42.1",
    status: seed.status,
    startedAt: started,
    endedAt:
      seed.durationMinutes !== undefined
        ? ago(seed.startedMinutesAgo - seed.durationMinutes)
        : null,
    reason: seed.reason ?? null,
    createdAt: ago(seed.startedMinutesAgo),
    updatedAt: ago(Math.max(0, seed.startedMinutesAgo - (seed.durationMinutes ?? 0)))
  };
});

const sessionStore = createFixtureStore(sessions);

export const pamOperationsDemo: PamOperationsAdapter = {
  useTemplates: (params) => {
    const all = templateStore.use();
    const search = params?.search?.toLowerCase();
    return {
      data: all.filter(
        (template) =>
          (!params?.type || template.type === params.type) &&
          (!search || template.name.toLowerCase().includes(search))
      ),
      isPending: false,
      error: null
    };
  },
  useTemplate: (templateId) => ({
    data: templateDetailStore.use().find((template) => template.id === templateId),
    isPending: false,
    error: null
  }),
  useCreateTemplate: fixtureMutation(({ name, description, type, policies, settings }) => {
    const created: TPamAccountTemplateDetail = {
      id: crypto.randomUUID(),
      name,
      description: description ?? null,
      type,
      policies: policies ?? {},
      settings: settings ?? {},
      gatewayId: null,
      gatewayPoolId: null,
      recordingConnectionId: null,
      accountCount: 0,
      rotationImpact: { willRotate: 0, needsRotationAccount: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeTemplates((current) => [...current, created]);
    return { ...toListItem(created), corsProbeUrl: null };
  }),
  useUpdateTemplate: fixtureMutation(({ templateId, ...patch }) => {
    const current = templateDetailStore.get().find((template) => template.id === templateId);
    if (!current) throw new Error("Template not found");
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    writeTemplates((all) => all.map((template) => (template.id === templateId ? next : template)));
    return { ...toListItem(next), corsProbeUrl: null };
  }),
  useDeleteTemplate: fixtureMutation(({ templateId }) => {
    const current = templateDetailStore.get().find((template) => template.id === templateId);
    if (!current) throw new Error("Template not found");
    writeTemplates((all) => all.filter((template) => template.id !== templateId));
    return toListItem(current);
  }),
  useRecordingConnections: () => ({
    data: [
      {
        id: uuid("c1", 1),
        name: "pam-recordings-aws",
        projectId: DEMO_PAM_PROJECT_ID,
        app: AppConnection.AWS,
        providerName: "AWS"
      },
      {
        id: uuid("c1", 2),
        name: "minio-archive",
        projectId: DEMO_PAM_PROJECT_ID,
        app: AppConnection.S3Compatible,
        providerName: "MinIO"
      }
    ],
    isPending: false,
    error: null
  }),

  useDiscoveryTypes: () => ({ data: discoveryTypes, isPending: false, error: null }),
  useDiscoverySources: (params) => {
    const all = sourceStore.use();
    const search = params?.search?.trim().toLowerCase();
    return {
      data: search ? all.filter((source) => source.name.toLowerCase().includes(search)) : all,
      isPending: false,
      error: null
    };
  },
  useDiscoveryRuns: (id) => ({
    data: runStore
      .use()
      .filter((entry) => entry.discoverySourceId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    isPending: false,
    error: null
  }),
  useDiscoveredAccounts: (id, params) => {
    const { rows, totalCount } = page(discoveredStore.use()[id] ?? [], params);
    return { data: { discoveredAccounts: rows, totalCount }, isPending: false, error: null };
  },
  useStaleAccounts: (id, params) => {
    const { rows, totalCount } = page(staleStore.use()[id] ?? [], params);
    return { data: { accounts: rows, totalCount }, isPending: false, error: null };
  },
  useCreateDiscoverySource: fixtureMutation(({ discoveryType, configuration, ...body }) => {
    const created: TPamDiscoverySource = {
      id: crypto.randomUUID(),
      projectId: DEMO_PAM_PROJECT_ID,
      discoveryType,
      name: body.name,
      credentialAccountId: body.credentialAccountId,
      gatewayId: body.gatewayId ?? null,
      gatewayPoolId: body.gatewayPoolId ?? null,
      schedule: body.schedule,
      discoveryConfiguration: configuration ?? {},
      lastRunAt: null,
      lastRunStatus: null,
      lastRunError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    sourceStore.update((current) => [...current, created]);
    return created;
  }),
  useUpdateDiscoverySource: fixtureMutation(
    ({ sourceId: id, discoveryType, configuration, ...patch }) => {
      const current = sourceStore.get().find((source) => source.id === id);
      if (!current) throw new Error("Discovery source not found");
      const next: TPamDiscoverySource = {
        ...current,
        ...patch,
        discoveryType,
        discoveryConfiguration: configuration ?? current.discoveryConfiguration,
        updatedAt: new Date().toISOString()
      };
      sourceStore.update((all) => all.map((source) => (source.id === id ? next : source)));
      return next;
    }
  ),
  useDeleteDiscoverySource: fixtureMutation(({ sourceId: id }) => {
    sourceStore.update((all) => all.filter((source) => source.id !== id));
  }),
  useTriggerDiscoveryScan: fixtureMutation(({ sourceId: id }) => {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    runStore.update((current) => [
      {
        id: runId,
        discoverySourceId: id,
        status: "running",
        triggeredBy: "manual",
        discoveredCount: 0,
        newCount: 0,
        startedAt,
        createdAt: startedAt
      },
      ...current
    ]);
    sourceStore.update((all) =>
      all.map((source) =>
        source.id === id ? { ...source, lastRunAt: startedAt, lastRunStatus: "running" } : source
      )
    );
    setTimeout(() => {
      const found = discoveredStore.get()[id]?.length ?? 0;
      runStore.update((current) =>
        current.map((entry) =>
          entry.id === runId
            ? {
                ...entry,
                status: "completed",
                discoveredCount: found,
                newCount: 0,
                completedAt: new Date().toISOString()
              }
            : entry
        )
      );
      sourceStore.update((all) =>
        all.map((source) =>
          source.id === id ? { ...source, lastRunStatus: "completed", lastRunError: null } : source
        )
      );
    }, 4000);
  }),
  useImportDiscoveredAccounts: fixtureMutation(({ sourceId: id, accounts }) => {
    const pending = discoveredStore.get()[id] ?? [];
    const imported = new Set(accounts.map((entry) => entry.discoveredAccountId));
    discoveredStore.update((current) => ({
      ...current,
      [id]: pending.filter((entry) => !imported.has(entry.id))
    }));
    return accounts.map((entry, index) => {
      const match = pending.find((candidate) => candidate.id === entry.discoveredAccountId);
      return {
        discoveredAccountId: entry.discoveredAccountId,
        status: "imported",
        accountId: crypto.randomUUID(),
        name: match?.name,
        ...(entry.rotationAccountId
          ? {
              rotationAccountId: entry.rotationAccountId,
              rotationStatus: index === 0 ? PamRotationStatus.Failed : PamRotationStatus.Success,
              rotationMessage:
                index === 0 ? "The rotation account can't reach this host" : undefined
            }
          : {})
      };
    });
  }),

  useSessions: (_projectId, params) => {
    const all = sessionStore.use();
    const search = params?.search?.trim().toLowerCase();
    const matching = all.filter(
      (session) =>
        (!params?.status || session.status === params.status) &&
        (!search ||
          `${session.actorName} ${session.actorEmail} ${session.accountName} ${session.folderName ?? ""}`
            .toLowerCase()
            .includes(search))
    );
    const offset = params?.offset ?? 0;
    return {
      data: {
        sessions: matching.slice(offset, offset + (params?.limit ?? matching.length)),
        totalCount: matching.length
      },
      isPending: false,
      error: null
    };
  },
  useSession: (id) => ({
    data: sessionStore.use().find((session) => session.id === id),
    isPending: false,
    error: null
  }),
  useSessionLogs: (id) => ({ data: sessionLogs.get(id) ?? [], isPending: false, error: null }),
  useTerminateSession: fixtureMutation(({ sessionId: id }) => {
    const current = sessionStore.get().find((session) => session.id === id);
    if (!current) throw new Error("Session not found");
    const next = {
      ...current,
      status: PamSessionStatus.Terminated,
      endedAt: new Date().toISOString()
    };
    sessionStore.update((all) => all.map((session) => (session.id === id ? next : session)));
    return next;
  })
};
