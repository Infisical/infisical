import type { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { useRouterState } from "@tanstack/react-router";
import ms from "ms";

import {
  PamAccessGrantStatus,
  PamAccessRequestDecision,
  PamAccessRequestStatus,
  PamAccessStatus,
  PamAccessType,
  PamAccountAccessibilityIssue,
  PamAccountType,
  PamAccountWarning,
  PamFolderCallerAccess,
  PamHeartbeatStatus,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamSessionStatus,
  buildPamAccountCan,
  type PamFolderPermissionSet,
  type TPamAccessRequest,
  type TPamIdentityMember,
  type TPamSession,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata,
  type TPamFolderWithCount
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { accessDemo } from "../access/demo";
import { DEMO_PAM_PROJECT_ID } from "../access/fixtures";
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

type RequestSeed = Partial<TPamAccessRequest> & {
  account: string;
  minutesAgo: number;
  duration: string;
  reason?: string;
};

const autoApprovalRules = {
  ticket: {
    id: uuid("c1", 1),
    name: "Linked change ticket",
    passed: true,
    conditions: [
      {
        id: uuid("c2", 1),
        description: "Ticket is in the Implement state",
        passed: true,
        reason: null
      },
      {
        id: uuid("c2", 2),
        description: "Ticket is assigned to the requester",
        passed: true,
        reason: null
      }
    ]
  },
  window: {
    id: uuid("c1", 2),
    name: "Change window",
    passed: false,
    conditions: [
      {
        id: uuid("c2", 3),
        description: "Ticket's planned window includes now",
        passed: false,
        reason: "The planned window starts in 3 hours"
      },
      {
        id: uuid("c2", 4),
        description: "Ticket risk is Low or Moderate",
        passed: false,
        reason: "Ticket risk is High"
      }
    ]
  },
  oncall: {
    id: uuid("c1", 3),
    name: "On-call engineer",
    passed: false,
    conditions: [
      {
        id: uuid("c2", 5),
        description: "Requester is on call for the service",
        passed: false,
        reason: "No PagerDuty schedule lists the requester right now"
      }
    ]
  }
};

const ticketInput = (value: string) => ({
  label: "ServiceNow change",
  value,
  url: `https://acme.service-now.com/change_request.do?number=${value}`
});

const requestSeeds: RequestSeed[] = [
  {
    account: "billing-admin",
    minutesAgo: 6,
    duration: "1h",
    reason: "Backfill invoice totals for the October close",
    requesterId: "u-miguel",
    requesterName: "Miguel Ortega",
    requesterEmail: "miguel@acme.dev",
    accessType: PamAccessType.Session
  },
  {
    account: "ledger-sa",
    minutesAgo: 18,
    duration: "30m",
    reason: "Rotate the reporting role password after the audit finding",
    requesterId: "u-priya",
    requesterName: "Priya Raman",
    requesterEmail: "priya@acme.dev",
    accessType: PamAccessType.Credential
  },
  {
    account: "aws-org-admin",
    minutesAgo: 42,
    duration: "2h",
    reason: "Apply the SCP change in CHG0031877",
    requesterId: "u-jonas",
    requesterName: "Jonas Weber",
    requesterEmail: "jonas@acme.dev",
    accessType: PamAccessType.Session,
    autoApproval: {
      approvedAt: null,
      approvedByRuleId: null,
      inputs: [ticketInput("CHG0031877")],
      rules: [autoApprovalRules.window, autoApprovalRules.oncall]
    }
  },
  {
    account: "reporting-oracle",
    minutesAgo: 75,
    duration: "4h",
    reason: "Quarterly revenue export",
    requesterId: "u-sarah",
    requesterName: "Sarah Lin",
    requesterEmail: "sarah@acme.dev",
    accessType: PamAccessType.Session
  },
  {
    account: "dc01-administrator",
    minutesAgo: 130,
    duration: "15m",
    requesterId: null,
    machineIdentityId: uuid("i0", 1),
    requesterName: "deploy-bot",
    requesterEmail: "",
    accessType: PamAccessType.Session
  },
  {
    account: "billing-admin",
    minutesAgo: 190,
    duration: "4h",
    reason: "Investigate the duplicate charge incident",
    requesterId: "u-amara",
    requesterName: "Amara Okafor",
    requesterEmail: "amara@acme.dev",
    accessType: PamAccessType.Session,
    status: PamAccessRequestStatus.Approved,
    grantId: uuid("g0", 1),
    grantExpiresAt: ahead(50),
    grantStatus: PamAccessGrantStatus.Active
  },
  {
    account: "aws-org-admin",
    minutesAgo: 260,
    duration: "1h",
    reason: "Roll out the CloudTrail retention change",
    requesterId: "u-jonas",
    requesterName: "Jonas Weber",
    requesterEmail: "jonas@acme.dev",
    accessType: PamAccessType.Session,
    status: PamAccessRequestStatus.Approved,
    grantId: uuid("g0", 2),
    grantExpiresAt: ahead(20),
    grantStatus: PamAccessGrantStatus.Active,
    autoApprovedAt: ago(259),
    autoApproval: {
      approvedAt: ago(259),
      approvedByRuleId: autoApprovalRules.ticket.id,
      inputs: [ticketInput("CHG0031802")],
      rules: [autoApprovalRules.ticket, autoApprovalRules.window]
    }
  },
  {
    account: "ledger-sa",
    minutesAgo: 60 * 7,
    duration: "2h",
    requesterId: "u-priya",
    requesterName: "Priya Raman",
    requesterEmail: "priya@acme.dev",
    accessType: PamAccessType.Session,
    status: PamAccessRequestStatus.Approved,
    grantId: uuid("g0", 3),
    grantExpiresAt: ahead(30),
    grantStatus: PamAccessGrantStatus.Active,
    isBreakGlass: true,
    bypassReason: "Payments are failing in production and no approver is online"
  },
  {
    account: "dc01-administrator",
    minutesAgo: 60 * 20,
    duration: "1h",
    reason: "Reset a locked service account",
    requesterId: "u-miguel",
    requesterName: "Miguel Ortega",
    requesterEmail: "miguel@acme.dev",
    accessType: PamAccessType.Credential,
    status: PamAccessRequestStatus.Approved,
    grantId: uuid("g0", 4),
    grantExpiresAt: ago(60 * 18),
    grantStatus: PamAccessGrantStatus.Active
  },
  {
    account: "reporting-oracle",
    minutesAgo: 60 * 26,
    duration: "8h",
    reason: "Ad hoc analysis",
    requesterId: "u-amara",
    requesterName: "Amara Okafor",
    requesterEmail: "amara@acme.dev",
    accessType: PamAccessType.Session,
    status: PamAccessRequestStatus.Approved,
    grantId: uuid("g0", 5),
    grantExpiresAt: ahead(60),
    grantStatus: PamAccessGrantStatus.Revoked
  },
  {
    account: "ledger-sa",
    minutesAgo: 60 * 30,
    duration: "1d",
    reason: "Need it for the week",
    requesterId: "u-jonas",
    requesterName: "Jonas Weber",
    requesterEmail: "jonas@acme.dev",
    accessType: PamAccessType.Credential,
    status: PamAccessRequestStatus.Rejected
  },
  {
    account: "aws-org-admin",
    minutesAgo: 60 * 50,
    duration: "1h",
    requesterId: null,
    requesterName: "Deleted identity",
    requesterEmail: "",
    accessType: PamAccessType.Session,
    status: PamAccessRequestStatus.Expired
  },
  {
    account: "billing-admin",
    minutesAgo: 60 * 72,
    duration: "3600000ms",
    reason: "Raised from the CLI by mistake",
    requesterId: "u-priya",
    requesterName: "Priya Raman",
    requesterEmail: "priya@acme.dev",
    status: PamAccessRequestStatus.Cancelled
  }
];

const accessRequests: TPamAccessRequest[] = requestSeeds.map(
  ({ account: accountName, minutesAgo, duration, reason, ...seed }, index) => {
    const account = accounts.find((entry) => entry.name === accountName) ?? accounts[0];
    return {
      id: uuid("r1", index + 1),
      projectId: DEMO_PAM_PROJECT_ID,
      policyId: uuid("p0", 1),
      requesterId: null,
      requesterName: "",
      requesterEmail: "",
      type: "pam-access",
      status: PamAccessRequestStatus.Pending,
      justification: reason ?? null,
      currentStep: 1,
      requestData: {
        version: 1,
        requestData: {
          accountId: account.id,
          folderId: account.folderId,
          reason,
          duration,
          accessType: seed.accessType
        }
      },
      expiresAt: null,
      scopeType: null,
      scopeId: null,
      createdAt: ago(minutesAgo),
      updatedAt: ago(minutesAgo),
      accountName: account.name,
      accountType: account.accountType as PamAccountType,
      folderName: account.folderName ?? undefined,
      host:
        account.accountType === PamAccountType.AwsIam
          ? undefined
          : `${account.name}.internal.acme.dev`,
      grantId: null,
      grantExpiresAt: null,
      grantStatus: null,
      isBreakGlass: false,
      bypassReason: null,
      autoApprovedAt: null,
      autoApproval: null,
      ...seed
    };
  }
);

const accessRequestStore = createFixtureStore(accessRequests);

type SessionSeed = {
  account: string;
  actor: "miguel" | "priya" | "dana" | "kenji" | "deploy-bot" | "deleted-identity";
  status: PamSessionStatus;
  startedMinutesAgo?: number;
  lengthMinutes?: number;
};

const actors = {
  miguel: { userId: "u-miguel", actorName: "Miguel Ortega", actorEmail: "miguel@acme.dev" },
  priya: { userId: "u-priya", actorName: "Priya Raman", actorEmail: "priya@acme.dev" },
  dana: { userId: "u-dana", actorName: "Dana Whitfield", actorEmail: "dana@acme.dev" },
  kenji: { userId: "u-kenji", actorName: "Kenji Sato", actorEmail: "kenji@contractors.acme.dev" },
  "deploy-bot": { identityId: "i-deploy-bot", actorName: "deploy-bot", actorEmail: "" },
  "deleted-identity": { actorName: "ci-runner", actorEmail: "" }
};

const sessionSeeds: SessionSeed[] = [
  {
    account: "orders-primary",
    actor: "miguel",
    status: PamSessionStatus.Active,
    startedMinutesAgo: 12
  },
  {
    account: "prod-us-east-1",
    actor: "priya",
    status: PamSessionStatus.Active,
    startedMinutesAgo: 47
  },
  {
    account: "contractor-ssh",
    actor: "kenji",
    status: PamSessionStatus.Active,
    startedMinutesAgo: 95
  },
  {
    account: "bastion-deploy",
    actor: "deploy-bot",
    status: PamSessionStatus.Active,
    startedMinutesAgo: 3
  },
  { account: "rdp-jumpbox", actor: "dana", status: PamSessionStatus.Starting },
  {
    account: "billing-admin",
    actor: "miguel",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 140,
    lengthMinutes: 38
  },
  {
    account: "warehouse-loader",
    actor: "dana",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 260,
    lengthMinutes: 72
  },
  {
    account: "aws-org-admin",
    actor: "priya",
    status: PamSessionStatus.Terminated,
    startedMinutesAgo: 320,
    lengthMinutes: 4
  },
  {
    account: "build-runner",
    actor: "deleted-identity",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 410,
    lengthMinutes: 1
  },
  {
    account: "events-readonly",
    actor: "dana",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 600,
    lengthMinutes: 15
  },
  {
    account: "dc01-administrator",
    actor: "priya",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 1_380,
    lengthMinutes: 190
  },
  {
    account: "catalog-mongo",
    actor: "miguel",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 1_460,
    lengthMinutes: 9
  },
  {
    account: "sessions-cache",
    actor: "kenji",
    status: PamSessionStatus.Terminated,
    startedMinutesAgo: 1_700,
    lengthMinutes: 26
  },
  {
    account: "prod-eu-west-1",
    actor: "priya",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 2_900,
    lengthMinutes: 51
  },
  {
    account: "gcp-billing",
    actor: "dana",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 3_100,
    lengthMinutes: 0.5
  },
  {
    account: "contractor-staging-db",
    actor: "kenji",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 4_300,
    lengthMinutes: 133
  },
  {
    account: "bastion-ops",
    actor: "deploy-bot",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 5_800,
    lengthMinutes: 2
  },
  {
    account: "azure-ops",
    actor: "miguel",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 7_200,
    lengthMinutes: 44
  },
  {
    account: "orders-replica",
    actor: "dana",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 8_650,
    lengthMinutes: 3_050
  },
  {
    account: "reporting-oracle",
    actor: "priya",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 10_100,
    lengthMinutes: 18
  },
  {
    account: "staging-cluster",
    actor: "miguel",
    status: PamSessionStatus.Terminated,
    startedMinutesAgo: 11_500,
    lengthMinutes: 61
  },
  {
    account: "ledger-sa",
    actor: "dana",
    status: PamSessionStatus.Ended,
    startedMinutesAgo: 14_400,
    lengthMinutes: 7
  }
];

const seededSessions: TPamSession[] = sessionSeeds.map(
  ({ account: accountName, actor, status, startedMinutesAgo, lengthMinutes }, index) => {
    const account = accounts.find((entry) => entry.name === accountName) ?? accounts[0];
    const createdMinutesAgo = startedMinutesAgo ?? 0;
    return {
      id: uuid("s0", index + 1),
      accountId: account.id,
      accountType: account.accountType as PamAccountType,
      accountName: account.name,
      folderId: account.folderId,
      folderName: account.folderName,
      actorIp: "203.0.113.24",
      actorUserAgent: "Infisical CLI",
      ...actors[actor],
      status,
      startedAt: startedMinutesAgo === undefined ? null : ago(startedMinutesAgo),
      endedAt:
        startedMinutesAgo === undefined || lengthMinutes === undefined
          ? null
          : ago(startedMinutesAgo - lengthMinutes),
      createdAt: ago(createdMinutesAgo),
      updatedAt: ago(createdMinutesAgo)
    };
  }
);

const deletedAccountSession: TPamSession = {
  id: uuid("s0", seededSessions.length + 1),
  accountId: null,
  accountType: PamAccountType.Postgres,
  accountName: "legacy-reporting",
  folderId: null,
  folderName: null,
  actorIp: "203.0.113.24",
  actorUserAgent: "Infisical CLI",
  ...actors.miguel,
  status: PamSessionStatus.Ended,
  startedAt: ago(20_160),
  endedAt: ago(20_100),
  createdAt: ago(20_160),
  updatedAt: ago(20_100)
};

const sessionStore = createFixtureStore([...seededSessions, deletedAccountSession]);

const SESSION_SCENARIOS = ["default", "empty", "loading", "error"] as const;

const useSessionScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { scenario?: unknown }).scenario;
      return SESSION_SCENARIOS.find((scenario) => scenario === value) ?? "default";
    }
  });

const PAM_PROJECT_TYPE = ProjectType.PAM;

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
  }),
  useProductIdentities: () => {
    const memberships = accessDemo.useProjectIdentities({
      projectId: DEMO_PAM_PROJECT_ID,
      offset: 0,
      limit: 1000
    });
    const data = memberships.data?.identityMemberships.map((entry): TPamIdentityMember => ({
      membershipId: entry.id,
      identityId: entry.identity.id,
      name: entry.identity.name,
      role: entry.roles[0]?.role ?? "member",
      isActive: true,
      createdAt: entry.createdAt,
      identityProjectId: entry.identity.projectId ?? null,
      identityOrgId: entry.identity.orgId
    }));
    return { data, isPending: memberships.isPending, error: memberships.error };
  },
  useAddProductUserMember: () => {
    const add = accessDemo.useAddProjectUsers();
    const available = accessDemo.useAvailableProjectUsers(DEMO_PAM_PROJECT_ID, PAM_PROJECT_TYPE);
    return {
      isPending: add.isPending,
      mutateAsync: async ({ userIds, emails, role, projectId }) => {
        const byId = (available.data ?? []).filter((user) => userIds?.includes(user.id));
        return add.mutateAsync({
          usernames: [...byId.map((user) => user.username), ...(emails ?? [])],
          orgId: V4_DEMO_ORG_ID,
          projectId,
          projectType: PAM_PROJECT_TYPE,
          roleSlugs: [role]
        });
      }
    };
  },
  useUpdateProductUserMember: () => {
    const update = accessDemo.useUpdateProjectUserRoles();
    const members = accessDemo.useProjectUsers(DEMO_PAM_PROJECT_ID);
    return {
      isPending: update.isPending,
      mutateAsync: async ({ userId, role, projectId }) => {
        const member = members.data?.find((entry) => entry.user.id === userId);
        return update.mutateAsync({
          membershipId: member?.id ?? "",
          projectId,
          projectType: PAM_PROJECT_TYPE,
          roles: [{ role }]
        });
      }
    };
  },
  useRemoveProductUserMember: () => {
    const remove = accessDemo.useRemoveProjectUsers();
    const members = accessDemo.useProjectUsers(DEMO_PAM_PROJECT_ID);
    return {
      isPending: remove.isPending,
      mutateAsync: async ({ userId, projectId }) => {
        const member = members.data?.find((entry) => entry.user.id === userId);
        return remove.mutateAsync({
          usernames: member ? [member.user.username] : [],
          orgId: V4_DEMO_ORG_ID,
          projectId,
          projectType: PAM_PROJECT_TYPE
        });
      }
    };
  },
  useAddProductGroupMember: () => {
    const add = accessDemo.useAddProjectGroup();
    return {
      isPending: add.isPending,
      mutateAsync: ({ groupId, role, projectId }) =>
        add.mutateAsync({ groupId, role, projectId, projectType: PAM_PROJECT_TYPE })
    };
  },
  useUpdateProductGroupMember: () => {
    const update = accessDemo.useUpdateProjectGroupRoles();
    return {
      isPending: update.isPending,
      mutateAsync: ({ groupId, role, projectId }) =>
        update.mutateAsync({
          groupId,
          projectId,
          projectType: PAM_PROJECT_TYPE,
          roles: [{ role }]
        })
    };
  },
  useRemoveProductGroupMember: () => {
    const remove = accessDemo.useRemoveProjectGroup();
    return {
      isPending: remove.isPending,
      mutateAsync: ({ groupId, projectId }) =>
        remove.mutateAsync({ groupId, projectId, projectType: PAM_PROJECT_TYPE })
    };
  },
  useAddProductIdentityMember: () => {
    const add = accessDemo.useAddProjectIdentity();
    return {
      isPending: add.isPending,
      mutateAsync: ({ identityId, role, projectId }) =>
        add.mutateAsync({ identityId, role, projectId, projectType: PAM_PROJECT_TYPE })
    };
  },
  useUpdateProductIdentityMember: () => {
    const update = accessDemo.useUpdateProjectIdentityRoles();
    return {
      isPending: update.isPending,
      mutateAsync: ({ identityId, role, projectId }) =>
        update.mutateAsync({
          identityId,
          projectId,
          projectType: PAM_PROJECT_TYPE,
          roles: [{ role }]
        })
    };
  },
  useRemoveProductIdentityMember: () => {
    const remove = accessDemo.useRemoveProjectIdentity();
    return {
      isPending: remove.isPending,
      mutateAsync: ({ identityId, projectId }) =>
        remove.mutateAsync({ identityId, projectId, projectType: PAM_PROJECT_TYPE })
    };
  },
  usePendingMyApproval: () => ({
    data: accessRequestStore.use(),
    isPending: false,
    error: null
  }),
  useReviewAccessRequest: () => ({
    isPending: false,
    mutateAsync: async ({ requestId, status }) => {
      const request = accessRequestStore.get().find((entry) => entry.id === requestId);
      if (!request || request.status !== PamAccessRequestStatus.Pending)
        throw new Error("This request has already been reviewed");
      const grantMs = ms(request.requestData?.requestData.duration ?? "1h");
      const approved = status === PamAccessRequestDecision.Approved;
      accessRequestStore.update((current) =>
        current.map((entry) =>
          entry.id === requestId
            ? {
                ...entry,
                status: approved
                  ? PamAccessRequestStatus.Approved
                  : PamAccessRequestStatus.Rejected,
                grantId: approved ? uuid("g1", current.indexOf(entry) + 1) : null,
                grantExpiresAt: approved
                  ? new Date(
                      Date.now() + (typeof grantMs === "number" ? grantMs : ms("1h"))
                    ).toISOString()
                  : null,
                grantStatus: approved ? PamAccessGrantStatus.Active : null
              }
            : entry
        )
      );
      return {};
    }
  }),
  useRevokeAccessRequest: () => ({
    isPending: false,
    mutateAsync: async ({ grantId }) => {
      accessRequestStore.update((current) =>
        current.map((entry) =>
          entry.grantId === grantId
            ? { ...entry, grantStatus: PamAccessGrantStatus.Revoked }
            : entry
        )
      );
      return {};
    }
  }),
  useSessions: (_projectId, params, options) => {
    const scenario = useSessionScenario();
    const allSessions = sessionStore.use();
    if (scenario === "loading" || options?.enabled === false)
      return { data: undefined, isPending: true, error: null };
    if (scenario === "error")
      return { data: undefined, isPending: false, error: new Error("Failed to load sessions") };
    const search = params?.search?.toLowerCase();
    const matches = (scenario === "empty" ? [] : allSessions).filter(
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
        sessions: matches.slice(offset, offset + (params?.limit ?? matches.length)),
        totalCount: matches.length
      },
      isPending: false,
      error: null
    };
  },
  useAccountActions: (accountId) => {
    const account = accountStore.use().find((entry) => entry.id === accountId);
    return { can: buildPamAccountCan(account?.permissions), isLoading: false };
  },
  useTerminateSession: () => ({
    isPending: false,
    mutateAsync: async ({ sessionId }) => {
      const session = sessionStore.get().find((entry) => entry.id === sessionId);
      if (!session || session.status !== PamSessionStatus.Active)
        throw new Error("This session has already ended");
      const terminated = {
        ...session,
        status: PamSessionStatus.Terminated,
        endedAt: new Date().toISOString()
      };
      sessionStore.update((current) =>
        current.map((entry) => (entry.id === sessionId ? terminated : entry))
      );
      return terminated;
    }
  })
};
