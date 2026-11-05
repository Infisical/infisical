import type { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import {
  PamAccessStatus,
  PamAccountAccessibilityIssue,
  PamAccountType,
  PamAccountWarning,
  PamFolderCallerAccess,
  PamHeartbeatStatus,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  type PamFolderPermissionSet,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata,
  type TPamFolderWithCount
} from "@app/hooks/api/pam";

import { createFixtureStore } from "../fixture-store";
import type { PamAdapter } from "./contract";

const uuid = (prefix: string, index: number) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const loadedAt = Date.now();
const ago = (minutes: number) => new Date(loadedAt - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(loadedAt + minutes * 60_000).toISOString();

const pack = (actions: PamResourcePermissionActions[]) =>
  packRules<RawRuleOf<MongoAbility<PamFolderPermissionSet>>>([
    { action: actions, subject: PamResourcePermissionSub.PamResource }
  ]);

const fullAccess = pack(Object.values(PamResourcePermissionActions));
const launchOnly = pack([
  PamResourcePermissionActions.ReadFolder,
  PamResourcePermissionActions.ReadAccounts,
  PamResourcePermissionActions.LaunchSessions
]);

const accountTypes: TPamAccountTypeMetadata[] = (
  [
    [PamAccountType.Postgres, "PostgreSQL", "Postgres.png"],
    [PamAccountType.MySQL, "MySQL", "MySql.png"],
    [PamAccountType.MsSQL, "Microsoft SQL Server", "MsSql.png"],
    [PamAccountType.OracleDB, "Oracle Database", "Oracle.png"],
    [PamAccountType.MongoDB, "MongoDB", "MongoDB.png"],
    [PamAccountType.Redis, "Redis", "Redis.png"],
    [PamAccountType.Snowflake, "Snowflake", "Snowflake.png"],
    [PamAccountType.ClickHouse, "ClickHouse", "ClickHouse.png"],
    [PamAccountType.SSH, "SSH", "SSH.png"],
    [PamAccountType.Kubernetes, "Kubernetes", "Kubernetes.png"],
    [PamAccountType.GcpServiceAccount, "GCP Service Account", "Google Cloud Platform.png"],
    [PamAccountType.Windows, "Windows", "Windows.png"],
    [PamAccountType.WindowsAd, "Windows AD", "ActiveDirectory.png"],
    [PamAccountType.AwsIam, "AWS IAM", "Amazon Web Services.png"],
    [PamAccountType.AzureCli, "Azure CLI", "Microsoft Azure.png"]
  ] as const
).map(([type, name, icon]) => ({
  type,
  name,
  icon,
  supportsWebAccess: false,
  requiresGateway: type !== PamAccountType.AwsIam,
  supportsDependencies: false,
  connectionFields: [],
  credentialFields: [],
  applicablePolicies: []
}));

const folders: TPamFolderWithCount[] = (
  [
    [
      "production-databases",
      "Primary data stores for customer-facing services",
      PamFolderCallerAccess.Admin
    ],
    ["analytics", "Warehouses and reporting replicas", PamFolderCallerAccess.Member],
    ["kubernetes-clusters", null, PamFolderCallerAccess.Admin],
    [
      "cloud-consoles",
      "Break-glass identities for AWS, GCP and Azure",
      PamFolderCallerAccess.Admin
    ],
    ["windows-fleet", "Domain controllers and RDP hosts", PamFolderCallerAccess.Member],
    ["linux-bastions", null, PamFolderCallerAccess.Admin],
    ["contractors", "Scoped access for external engineers", PamFolderCallerAccess.Member],
    ["finance-legacy", "Owned by the finance platform team", PamFolderCallerAccess.None]
  ] as const
).map(([name, description, callerAccess], index) => ({
  id: uuid("f0", index + 1),
  name,
  description,
  callerAccess,
  accountCount: 0,
  createdAt: ago(60 * 24 * (90 - index * 7)),
  updatedAt: ago(60 * (index + 2))
}));

type AccountSeed = {
  name: string;
  folder: string;
  type: PamAccountType;
  description?: string;
  issues?: PamAccountAccessibilityIssue[];
  requiresApproval?: boolean;
  access?: PamAccessStatus;
  grantMinutes?: number;
  isStale?: boolean;
  warnings?: PamAccountWarning[];
  heartbeat?: PamHeartbeatStatus;
};

const seeds: AccountSeed[] = [
  {
    name: "orders-primary",
    folder: "production-databases",
    type: PamAccountType.Postgres
  },
  {
    name: "orders-replica",
    folder: "production-databases",
    type: PamAccountType.Postgres,
    heartbeat: PamHeartbeatStatus.Healthy
  },
  {
    name: "billing-admin",
    folder: "production-databases",
    type: PamAccountType.MySQL,
    requiresApproval: true,
    access: PamAccessStatus.Granted,
    grantMinutes: 221
  },
  {
    name: "ledger-sa",
    folder: "production-databases",
    type: PamAccountType.MsSQL,
    requiresApproval: true
  },
  {
    name: "sessions-cache",
    folder: "production-databases",
    type: PamAccountType.Redis,
    heartbeat: PamHeartbeatStatus.InvalidCredentials
  },
  {
    name: "catalog-mongo",
    folder: "production-databases",
    type: PamAccountType.MongoDB
  },
  {
    name: "warehouse-loader",
    folder: "analytics",
    type: PamAccountType.Snowflake
  },
  {
    name: "events-readonly",
    folder: "analytics",
    type: PamAccountType.ClickHouse,
    isStale: true
  },
  {
    name: "reporting-oracle",
    folder: "analytics",
    type: PamAccountType.OracleDB,
    requiresApproval: true,
    access: PamAccessStatus.Pending
  },
  {
    name: "prod-us-east-1",
    folder: "kubernetes-clusters",
    type: PamAccountType.Kubernetes
  },
  {
    name: "prod-eu-west-1",
    folder: "kubernetes-clusters",
    type: PamAccountType.Kubernetes
  },
  {
    name: "staging-cluster",
    folder: "kubernetes-clusters",
    type: PamAccountType.Kubernetes,
    issues: [PamAccountAccessibilityIssue.NoGateway]
  },
  {
    name: "aws-org-admin",
    folder: "cloud-consoles",
    type: PamAccountType.AwsIam,
    requiresApproval: true
  },
  {
    name: "gcp-billing",
    folder: "cloud-consoles",
    type: PamAccountType.GcpServiceAccount
  },
  {
    name: "azure-ops",
    folder: "cloud-consoles",
    type: PamAccountType.AzureCli
  },
  {
    name: "dc01-administrator",
    folder: "windows-fleet",
    type: PamAccountType.WindowsAd,
    requiresApproval: true,
    issues: [PamAccountAccessibilityIssue.NoRecordingConfig]
  },
  {
    name: "rdp-jumpbox",
    folder: "windows-fleet",
    type: PamAccountType.Windows,
    heartbeat: PamHeartbeatStatus.CannotCheck
  },
  { name: "bastion-ops", folder: "linux-bastions", type: PamAccountType.SSH },
  {
    name: "bastion-deploy",
    folder: "linux-bastions",
    type: PamAccountType.SSH,
    warnings: [PamAccountWarning.SessionLogMaskingDegraded]
  },
  {
    name: "build-runner",
    folder: "linux-bastions",
    type: PamAccountType.SSH,
    issues: [PamAccountAccessibilityIssue.NoCredential]
  },
  {
    name: "contractor-staging-db",
    folder: "contractors",
    type: PamAccountType.Postgres
  },
  { name: "contractor-ssh", folder: "contractors", type: PamAccountType.SSH },
  { name: "ap-ledger", folder: "finance-legacy", type: PamAccountType.MsSQL },
  {
    name: "payroll-oracle",
    folder: "finance-legacy",
    type: PamAccountType.OracleDB
  }
];

const accounts: TPamAccountListItem[] = seeds.map((seed, index) => {
  const folder = folders.find((entry) => entry.name === seed.folder) ?? folders[0];
  const access = seed.access ?? PamAccessStatus.None;
  const issues = seed.issues ?? [];
  return {
    id: uuid("a0", index + 1),
    name: seed.name,
    description: seed.description ?? null,
    folderId: folder.id,
    folderName: folder.name,
    templateId: uuid("e0", 1),
    templateName: "Default",
    accountType: seed.type,
    gatewayId: null,
    gatewayPoolId: null,
    recordingConnectionId: null,
    isAccessible: issues.length === 0,
    accessibilityIssues: issues,
    isStale: seed.isStale ?? false,
    warnings: seed.warnings ?? [],
    heartbeatStatus: seed.heartbeat ?? null,
    heartbeatEnabled: Boolean(seed.heartbeat),
    requiresApproval: seed.requiresApproval ?? false,
    supportsCredentialReveal: seed.type !== PamAccountType.Kubernetes,
    requireReason: Boolean(seed.requiresApproval),
    accessStatus: access,
    grantExpiresAt: seed.grantMinutes ? ahead(seed.grantMinutes) : null,
    pendingRequestId: access === PamAccessStatus.Pending ? uuid("r0", index + 1) : null,
    canBreakGlass: false,
    credentialAccessStatus: PamAccessStatus.None,
    credentialPendingRequestId: null,
    permissions: folder.name === "contractors" ? launchOnly : fullAccess,
    createdAt: ago(60 * 24 * (60 - index)),
    updatedAt: ago(60 * (index + 1))
  };
});

const folderStore = createFixtureStore(folders);
const accountStore = createFixtureStore(accounts);

const memberFolderIds = new Set(
  folders
    .filter(({ callerAccess }) => callerAccess !== PamFolderCallerAccess.None)
    .map(({ id }) => id)
);

export const pamDemo: PamAdapter = {
  useAccessCapabilities: () => ({
    data: {
      isProductAdmin: true,
      isResourceAdmin: true,
      canViewSessions: true,
      canViewAuditLogs: true
    },
    isPending: false,
    error: null
  }),
  useFolders: (params) => {
    const allFolders = folderStore.use();
    const allAccounts = accountStore.use();
    const search = params?.search?.toLowerCase();
    const data = allFolders
      .filter(({ id, name, callerAccess }) => {
        if (search && !name.toLowerCase().includes(search)) return false;
        if (callerAccess === PamFolderCallerAccess.None)
          return Boolean(params?.includeNonMemberFolders);
        if (params?.filterByAction === PamResourcePermissionActions.CreateAccounts)
          return name !== "contractors";
        return memberFolderIds.has(id);
      })
      .map((folder) => ({
        ...folder,
        accountCount: allAccounts.filter(({ folderId }) => folderId === folder.id).length
      }));
    return { data, isPending: false, error: null };
  },
  useAccounts: (params, options) => {
    const allAccounts = accountStore.use();
    if (options?.enabled === false) return { data: undefined, isPending: true, error: null };
    const search = params?.search?.toLowerCase();
    const data = allAccounts.filter(
      (account) =>
        memberFolderIds.has(account.folderId) &&
        (!params?.folderId || account.folderId === params.folderId) &&
        (!params?.templateId || account.templateId === params.templateId) &&
        (!params?.accountType || account.accountType === params.accountType) &&
        (!search ||
          account.name.toLowerCase().includes(search) ||
          Boolean(account.description?.toLowerCase().includes(search)))
    );
    return { data, isPending: false, error: null };
  },
  useAccountTypes: () => ({
    data: accountTypes,
    isPending: false,
    error: null
  })
};
