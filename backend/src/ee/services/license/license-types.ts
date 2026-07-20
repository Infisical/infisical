import { TOrgPermission } from "@app/lib/types";

export enum InstanceType {
  OnPrem = "self-hosted",
  EnterpriseOnPrem = "enterprise-self-hosted",
  EnterpriseOnPremOffline = "enterprise-self-hosted-offline",
  // Self-hosted instance whose license is resolved from License Server v2 (new "infisical_lk_" key).
  EnterpriseOnPremV2 = "enterprise-self-hosted-v2",
  Cloud = "cloud"
}

export type TOfflineLicenseContents = {
  license: TOfflineLicense;
  signature: string;
};

export type TOfflineLicense = {
  issuedTo: string;
  licenseId: string;
  customerId: string | null;
  issuedAt: string;
  expiresAt: string | null;
  terminatesAt: string | null;
  features: TFeatureSet;
};

export type TPlanBillingInfo = {
  currentPeriodStart: number;
  currentPeriodEnd: number;
  interval: "month" | "year";
  intervalCount: number;
  amount: number;
  quantity: number;
};

export type TFeatureSet = {
  _id: null;
  slug: string | null;
  tier: -1;
  workspaceLimit: null;
  workspacesUsed: number;
  dynamicSecret: false;
  memberLimit: null;
  membersUsed: number;
  identityLimit: null;
  identitiesUsed: number;
  enforceIdentityLimit?: boolean;
  subOrganization: false;
  environmentLimit: null;
  environmentsUsed: 0;
  secretVersioning: true;
  pitRecovery: false;
  ipAllowlisting: false;
  rbac: false;
  customRateLimits: false;
  customAlerts: false;
  auditLogs: false;
  auditLogsRetentionDays: 0;
  auditLogStreams: false;
  auditLogStreamLimit: 3;
  githubOrgSync: false;
  samlSSO: false;
  enforceGoogleSSO: false;
  hsm: false;
  oidcSSO: false;
  secretAccessInsights: false;
  scim: false;
  ldap: false;
  groups: false;
  status: null;
  trial_end: null;
  has_used_trial: true;
  secretApproval: false;
  secretRotation: false;
  caCrl: false;
  instanceUserManagement: false;
  externalKms: false;
  rateLimits: {
    readLimit: number;
    writeLimit: number;
    secretsLimit: number;
  };
  pkiEst: boolean;
  pkiAcme: true;
  pkiScep: false;
  pkiPqc: false;
  // PKI code signing capability. null (default) is ignored (no restriction); an explicit boolean gates
  // code signer creation.
  pkiCodeSigning: null;
  kmsPqc: false;
  enforceMfa: false;
  projectTemplates: false;
  kmip: false;
  gateway: false;
  gatewayPool: false;
  pamSlackNotifications: boolean;
  sshHostGroups: false;
  secretScanning: false;
  enterpriseSecretSyncs: false;
  enterpriseCertificateSyncs: false;
  enterpriseAppConnections: false;
  machineIdentityAuthTemplates: false;
  pkiLegacyTemplates: false;
  fips: false;
  eventSubscriptions: false;
  secretShareExternalBranding: false;
  honeyTokens: false;
  honeyTokenLimit: 0;
  secretsBrokering: true;
  // Max secret syncs allowed org-wide. null (default) means uncapped; a number enforces the cap at
  // creation time.
  secretSyncLimit: null;
  // Max internal CAs allowed org-wide (external CAs are not capped). null (default) means uncapped; a
  // number enforces the cap at creation time.
  maxInternalCas: null;
  // Max PAM accounts allowed org-wide. null (default) means uncapped; a number enforces the cap at
  // creation time.
  maxPamAccounts: null;
  // Product gate flags. null (default) is ignored; an explicit `true` blocks the product's primary
  // creation operation (PAM accounts / certificate authorities) and surfaces an upgrade modal.
  pam: null;
  certManager: null;
  secretsTemporaryAccess: null;
  enterprisePamAccount: null;
};

export type TOrgPlansTableDTO = {
  billingCycle: string;
} & TOrgPermission;

export type TOrgPlanDTO = {
  projectId?: string;
  refreshCache?: boolean;
  rootOrgId: string;
} & TOrgPermission;

export type TStartOrgTrialDTO = {
  success_url: string;
} & TOrgPermission;

export type TCreateOrgPortalSession = TOrgPermission;

export type TGetOrgBillInfoDTO = TOrgPermission;

export type TOrgPlanTableDTO = TOrgPermission;

export type TOrgBillingDetailsDTO = TOrgPermission;

export type TUpdateOrgBillingDetailsDTO = TOrgPermission & {
  name?: string;
  email?: string;
};

export type TOrgPmtMethodsDTO = TOrgPermission;

export type TAddOrgPmtMethodDTO = TOrgPermission & { success_url: string; cancel_url: string };

export type TDelOrgPmtMethodDTO = TOrgPermission & { pmtMethodId: string };

export type TGetOrgTaxIdDTO = TOrgPermission;

export type TAddOrgTaxIdDTO = TOrgPermission & { type: string; value: string };

export type TDelOrgTaxIdDTO = TOrgPermission & { taxId: string };

export type TOrgInvoiceDTO = TOrgPermission;

export type TOrgLicensesDTO = TOrgPermission;

export enum LicenseType {
  Offline = "offline",
  Online = "online",
  // New self-hosted key (prefix "infisical_lk_") that resolves entitlements from License Server v2.
  OnlineV2 = "online-v2"
}

export type TLicenseKeyConfig =
  | {
      isValid: false;
    }
  | {
      isValid: true;
      licenseKey: string;
      type: LicenseType;
    };
