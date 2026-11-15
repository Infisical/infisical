import type { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import ms from "ms";

import {
  buildPamAccountCan,
  PamAccessGrantStatus,
  PamAccessRequestDecision,
  PamAccessRequestStatus,
  PamAccessStatus,
  PamAccessType,
  PamAccountAccessibilityIssue,
  PamAccountType,
  PamAccountWarning,
  PamFieldWidget,
  PamFolderCallerAccess,
  PamHeartbeatStatus,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  type PamFolderPermissionSet,
  type TPamAccessRequest,
  type TPamIdentityMember,
  type TPamAccountListItem,
  type TPamAccount,
  type TPamAccountTypeMetadata,
  type TPamFieldDescriptor,
  type TPamFolderWithCount
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { accessDemo } from "../access/demo";
import { DEMO_PAM_PROJECT_ID } from "../access/fixtures";
import { createFixtureStore } from "../fixture-store";
import type { PamAdapter } from "./contract";
import {
  demoApplicablePolicies,
  discoveredAccountsOf,
  pamOperationsDemo,
  templateStore
} from "./operations/demo";

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

const text = (
  key: string,
  label: string,
  extra: Partial<TPamFieldDescriptor> = {}
): TPamFieldDescriptor => ({
  key,
  label,
  widget: PamFieldWidget.Text,
  required: true,
  secret: false,
  ...extra
});

const DEFAULT_PORTS: Partial<Record<PamAccountType, number>> = {
  [PamAccountType.Postgres]: 5432,
  [PamAccountType.MySQL]: 3306,
  [PamAccountType.MsSQL]: 1433,
  [PamAccountType.OracleDB]: 1521,
  [PamAccountType.MongoDB]: 27017,
  [PamAccountType.Redis]: 6379,
  [PamAccountType.ClickHouse]: 9000,
  [PamAccountType.SSH]: 22,
  [PamAccountType.Windows]: 3389,
  [PamAccountType.WindowsAd]: 3389
};

const CONNECTION_STRING_SCHEMES: Partial<Record<PamAccountType, string[]>> = {
  [PamAccountType.Postgres]: ["postgres", "postgresql"],
  [PamAccountType.MySQL]: ["mysql"],
  [PamAccountType.MongoDB]: ["mongodb", "mongodb+srv"],
  [PamAccountType.Redis]: ["redis", "rediss"]
};

const SSH_AUTH_METHODS = [
  { label: "Password", value: "password" },
  { label: "Public key", value: "public-key" },
  { label: "Certificate", value: "certificate" }
];

const connectionFieldsFor = (type: PamAccountType): TPamFieldDescriptor[] => {
  const port = DEFAULT_PORTS[type];
  if (type === PamAccountType.AwsIam) return [text("roleArn", "Role ARN")];
  if (type === PamAccountType.AzureCli) return [text("tenantId", "Tenant ID")];
  if (type === PamAccountType.GcpServiceAccount)
    return [text("serviceAccountEmail", "Service account email")];
  if (type === PamAccountType.Kubernetes)
    return [
      text("url", "API server URL"),
      {
        key: "sslRejectUnauthorized",
        label: "Reject unauthorized certificates",
        widget: PamFieldWidget.Boolean,
        required: false,
        secret: false,
        defaultValue: true
      }
    ];
  if (type === PamAccountType.Snowflake)
    return [text("account", "Account identifier"), text("database", "Database")];
  const fields = [
    text("host", "Host"),
    {
      ...text("port", "Port"),
      widget: PamFieldWidget.Number,
      ...(port ? { defaultValue: port } : {})
    }
  ];
  if (type === PamAccountType.SSH || type === PamAccountType.Windows) return fields;
  if (type === PamAccountType.WindowsAd) return [...fields, text("domain", "Domain")];
  return [
    ...fields,
    text("database", "Database", { required: type !== PamAccountType.Redis }),
    {
      key: "sslEnabled",
      label: "Use SSL",
      widget: PamFieldWidget.Boolean,
      required: false,
      secret: false,
      defaultValue: true
    }
  ];
};

const credentialFieldsFor = (type: PamAccountType): TPamFieldDescriptor[] => {
  const password: TPamFieldDescriptor = {
    key: "password",
    label: "Password",
    widget: PamFieldWidget.Password,
    required: false,
    secret: true
  };
  if (type === PamAccountType.AwsIam || type === PamAccountType.GcpServiceAccount) return [];
  if (type === PamAccountType.Kubernetes)
    return [
      {
        key: "serviceAccountToken",
        label: "Service account token",
        widget: PamFieldWidget.Textarea,
        required: false,
        secret: true
      }
    ];
  if (type === PamAccountType.SSH)
    return [
      {
        key: "authMethod",
        label: "Authentication method",
        widget: PamFieldWidget.Select,
        required: true,
        secret: false,
        options: SSH_AUTH_METHODS
      },
      text("username", "Username"),
      { ...password, showWhen: { field: "authMethod", equals: "password" } },
      {
        key: "privateKey",
        label: "Private key",
        widget: PamFieldWidget.Textarea,
        required: false,
        secret: true,
        showWhen: { field: "authMethod", equals: "public-key" }
      }
    ];
  return [text("username", "Username"), password];
};

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
  connectionStringSchemes: CONNECTION_STRING_SCHEMES[type],
  connectionFields: connectionFieldsFor(type),
  credentialFields: credentialFieldsFor(type),
  applicablePolicies: demoApplicablePolicies(type)
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

const templateFor = (type: string) =>
  templateStore.get().find((template) => template.type === type);

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
    templateId: templateFor(seed.type)?.id ?? uuid("e0", 1),
    templateName: templateFor(seed.type)?.name ?? "Default",
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
export const accountStore = createFixtureStore(accounts);

type AccountDetails = Pick<TPamAccount, "connectionDetails" | "credentials">;

const detailsFor = (account: TPamAccountListItem): AccountDetails => {
  const type = account.accountType as PamAccountType;
  const host = `${account.name}.internal.acme.dev`;
  const connection: Record<string, unknown> = Object.fromEntries(
    connectionFieldsFor(type).map((field) => {
      if (field.key === "host") return [field.key, host];
      if (field.key === "database") return [field.key, account.name.split("-")[0]];
      if (field.key === "url") return [field.key, `https://${host}:6443`];
      if (field.key === "roleArn")
        return [field.key, "arn:aws:iam::000000000000:role/infisical-pam-demo"];
      if (field.key === "tenantId") return [field.key, "00000000-0000-4000-8000-0000000000aa"];
      if (field.key === "serviceAccountEmail")
        return [field.key, `${account.name}@acme-demo.iam.gserviceaccount.com`];
      if (field.key === "account") return [field.key, "acme-demo"];
      if (field.key === "domain") return [field.key, "corp.acme.dev"];
      return [field.key, field.defaultValue ?? ""];
    })
  );
  const credentials: Record<string, unknown> = {};
  credentialFieldsFor(type).forEach((field) => {
    if (field.key === "username") credentials.username = `svc_${account.name.replace(/-/g, "_")}`;
    if (field.key === "authMethod") credentials.authMethod = "password";
  });
  return { connectionDetails: connection, credentials };
};

const overridesStore = createFixtureStore<Record<string, TPamAccount["settingsOverrides"]>>({});

const accountDetailStore = createFixtureStore<Record<string, AccountDetails>>(
  Object.fromEntries(accounts.map((account) => [account.id, detailsFor(account)]))
);

const isMemberFolder = (folderId: string) => {
  const folder = folderStore.get().find(({ id }) => id === folderId);
  return Boolean(folder && folder.callerAccess !== PamFolderCallerAccess.None);
};

const folderPermissions = (folderName?: string) =>
  folderName === "contractors" ? launchOnly : fullAccess;

const moveTemplateCount = (from: string | null, to: string | null) =>
  templateStore.update((current) =>
    current.map((template) => {
      const delta = (template.id === to ? 1 : 0) - (template.id === from ? 1 : 0);
      return delta
        ? { ...template, accountCount: Math.max(0, template.accountCount + delta) }
        : template;
    })
  );

const newAccount = (
  fields: Pick<
    TPamAccountListItem,
    | "id"
    | "name"
    | "description"
    | "accountType"
    | "folderId"
    | "templateId"
    | "gatewayId"
    | "gatewayPoolId"
  >
): TPamAccountListItem => {
  const folder = folderStore.get().find(({ id }) => id === fields.folderId);
  const template = templateStore.get().find(({ id }) => id === fields.templateId);
  const now = new Date().toISOString();
  return {
    ...accounts[0],
    ...fields,
    folderName: folder?.name ?? "",
    templateName: template?.name ?? "Default",
    isAccessible: true,
    accessibilityIssues: [],
    isStale: false,
    warnings: [],
    heartbeatStatus: null,
    heartbeatEnabled: false,
    requiresApproval: false,
    accessStatus: PamAccessStatus.None,
    grantExpiresAt: null,
    pendingRequestId: null,
    permissions: folderPermissions(folder?.name ?? ""),
    createdAt: now,
    updatedAt: now
  };
};

const accountTypeOf = (type: string) =>
  accountTypes.find((meta) => meta.type === type) ?? accountTypes[0];

let createdCount = 0;

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

export const accessRequestStore = createFixtureStore(accessRequests);

const PAM_PROJECT_TYPE = ProjectType.PAM;

export const pamDemo: PamAdapter = {
  ...pamOperationsDemo,
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
        return isMemberFolder(id);
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
        isMemberFolder(account.folderId) &&
        (!params?.filterByAction ||
          buildPamAccountCan(account.permissions)(params.filterByAction)) &&
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
  useAccount: (accountId) => {
    const allAccounts = accountStore.use();
    const details = accountDetailStore.use();
    const overrides = overridesStore.use();
    const account = allAccounts.find(({ id }) => id === accountId);
    if (!account) return { data: undefined, isPending: Boolean(accountId), error: null };
    return {
      data: {
        ...account,
        accountType: account.accountType as PamAccountType,
        templatePolicies: {},
        templateSettings: {},
        settingsOverrides: overrides[account.id] ?? null,
        ...(details[account.id] ?? detailsFor(account))
      },
      isPending: false,
      error: null
    };
  },
  useFolderActions: (folderId) => {
    const folder = folderStore.use().find(({ id }) => id === folderId);
    const can = buildPamAccountCan(
      folder && folder.callerAccess !== PamFolderCallerAccess.None
        ? folderPermissions(folder.name)
        : []
    );
    return { can, isLoading: false };
  },
  useAccountActions: (accountId) => {
    const account = accountStore.use().find(({ id }) => id === accountId);
    return { can: buildPamAccountCan(account?.permissions), isLoading: false };
  },
  useCreateFolder: () => ({
    isPending: false,
    mutateAsync: async ({ name, description }) => {
      if (folderStore.get().some((folder) => folder.name === name))
        throw new Error(`A folder named ${name} already exists`);
      createdCount += 1;
      const now = new Date().toISOString();
      const folder: TPamFolderWithCount = {
        id: uuid("f1", createdCount),
        name,
        description: description ?? null,
        callerAccess: PamFolderCallerAccess.Admin,
        accountCount: 0,
        createdAt: now,
        updatedAt: now
      };
      folderStore.update((current) => [...current, folder]);
      return folder;
    }
  }),
  useUpdateFolder: () => ({
    isPending: false,
    mutateAsync: async ({ folderId, ...changes }) => {
      const existing = folderStore.get().find(({ id }) => id === folderId);
      if (!existing) throw new Error("This folder no longer exists");
      if (
        changes.name &&
        folderStore.get().some((folder) => folder.id !== folderId && folder.name === changes.name)
      )
        throw new Error(`A folder named ${changes.name} already exists`);
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      folderStore.update((current) =>
        current.map((folder) => (folder.id === folderId ? updated : folder))
      );
      accountStore.update((current) =>
        current.map((account) =>
          account.folderId === folderId ? { ...account, folderName: updated.name } : account
        )
      );
      return updated;
    }
  }),
  useDeleteFolder: () => ({
    isPending: false,
    mutateAsync: async ({ folderId }) => {
      const folder = folderStore.get().find(({ id }) => id === folderId);
      if (!folder) throw new Error("This folder no longer exists");
      if (accountStore.get().some((account) => account.folderId === folderId))
        throw new Error("Move or delete the accounts in this folder first");
      folderStore.update((current) => current.filter(({ id }) => id !== folderId));
      return folder;
    }
  }),
  useGrantFolderAdminAccess: () => ({
    isPending: false,
    mutateAsync: async ({ folderId }) => {
      folderStore.update((current) =>
        current.map((folder) =>
          folder.id === folderId ? { ...folder, callerAccess: PamFolderCallerAccess.Admin } : folder
        )
      );
      return {
        folderId,
        membershipId: uuid("m1", 1),
        userId: "u-demo",
        role: "admin",
        createdAt: new Date().toISOString()
      };
    }
  }),
  useCreateAccount: () => ({
    isPending: false,
    mutateAsync: async ({ accountType, name, description, folderId, templateId, ...rest }) => {
      const folder = folderStore.get().find(({ id }) => id === folderId);
      if (!folder) throw new Error("Select a folder");
      if (
        accountStore.get().some((account) => account.name === name && account.folderId === folderId)
      )
        throw new Error(`An account named ${name} already exists in this folder`);
      createdCount += 1;
      const id = uuid("a1", createdCount);
      const credentials = Object.fromEntries(
        Object.entries(rest.credentials).filter(
          ([key]) =>
            !accountTypeOf(accountType).credentialFields.some(
              (field) => field.key === key && field.secret
            )
        )
      );
      const account = newAccount({
        id,
        name,
        description: description ?? null,
        accountType,
        folderId,
        templateId,
        gatewayId: rest.gatewayId ?? null,
        gatewayPoolId: rest.gatewayPoolId ?? null
      });
      accountStore.update((current) => [...current, account]);
      moveTemplateCount(null, templateId);
      accountDetailStore.update((current) => ({
        ...current,
        [id]: { connectionDetails: rest.connectionDetails, credentials }
      }));
      return { ...account, corsProbeUrl: null };
    }
  }),
  useUpdateAccount: () => ({
    isPending: false,
    mutateAsync: async ({ accountId, accountType, connectionDetails, credentials, ...changes }) => {
      const existing = accountStore.get().find(({ id }) => id === accountId);
      if (!existing) throw new Error("This account no longer exists");
      const folder = folderStore
        .get()
        .find(({ id }) => id === (changes.folderId ?? existing.folderId));
      const template = templateStore
        .get()
        .find(({ id }) => id === (changes.templateId ?? existing.templateId));
      const updated: TPamAccountListItem = {
        ...existing,
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        folderId: folder?.id ?? existing.folderId,
        folderName: folder?.name ?? existing.folderName,
        templateId: template?.id ?? existing.templateId,
        templateName: template?.name ?? existing.templateName,
        ...(changes.gatewayId !== undefined ? { gatewayId: changes.gatewayId } : {}),
        ...(changes.gatewayPoolId !== undefined ? { gatewayPoolId: changes.gatewayPoolId } : {}),
        ...(changes.recordingConnectionId !== undefined
          ? { recordingConnectionId: changes.recordingConnectionId }
          : {}),
        updatedAt: new Date().toISOString()
      };
      if (changes.settingsOverrides !== undefined)
        overridesStore.update((current) => ({
          ...current,
          [accountId]: changes.settingsOverrides ?? null
        }));
      accountStore.update((current) =>
        current.map((account) => (account.id === accountId ? updated : account))
      );
      moveTemplateCount(existing.templateId, updated.templateId);
      const secretKeys = new Set(
        accountTypeOf(accountType)
          .credentialFields.filter((field) => field.secret)
          .map((field) => field.key)
      );
      accountDetailStore.update((current) => {
        const previous = current[accountId] ?? detailsFor(existing);
        return {
          ...current,
          [accountId]: {
            connectionDetails: connectionDetails ?? previous.connectionDetails,
            credentials: {
              ...previous.credentials,
              ...Object.fromEntries(
                Object.entries(credentials ?? {}).filter(([key]) => !secretKeys.has(key))
              )
            }
          }
        };
      });
      return { ...updated, corsProbeUrl: null };
    }
  }),
  useImportDiscoveredAccounts: () => {
    const base = pamOperationsDemo.useImportDiscoveredAccounts();
    return {
      ...base,
      mutateAsync: async (input: Parameters<typeof base.mutateAsync>[0]) => {
        const discovered = discoveredAccountsOf(input.sourceId);
        const results = await base.mutateAsync(input);
        results.forEach(({ status, accountId, discoveredAccountId }) => {
          const entry = input.accounts.find(
            (item) => item.discoveredAccountId === discoveredAccountId
          );
          const found = discovered.find(({ id }) => id === discoveredAccountId);
          if (status !== "imported" || !accountId || !entry || !found) return;
          const account = newAccount({
            id: accountId,
            name: entry.name ?? found.name,
            description: null,
            accountType: found.accountType,
            folderId: input.folderId,
            templateId: entry.templateId,
            gatewayId: null,
            gatewayPoolId: null
          });
          const [username, host] = found.name.includes("@")
            ? found.name.split("@", 2)
            : [undefined, found.name];
          const defaults = detailsFor(account);
          accountStore.update((current) => [...current, account]);
          accountDetailStore.update((current) => ({
            ...current,
            [accountId]: {
              connectionDetails: { ...defaults.connectionDetails, host },
              credentials: { ...defaults.credentials, ...(username ? { username } : {}) }
            }
          }));
          moveTemplateCount(null, entry.templateId);
        });
        return results;
      }
    };
  },
  useDeleteAccount: () => ({
    isPending: false,
    mutateAsync: async ({ accountId }) => {
      const existing = accountStore.get().find(({ id }) => id === accountId);
      if (!existing) throw new Error("This account no longer exists");
      accountStore.update((current) => current.filter(({ id }) => id !== accountId));
      moveTemplateCount(existing.templateId, null);
      return existing;
    }
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
        const wanted = new Set(userIds);
        const byId = (available.data ?? []).filter((user) => wanted.has(user.id));
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
  })
};
