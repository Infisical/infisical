import { TOrgPermission } from "@app/lib/types";

export enum InstanceType {
  OnPrem = "self-hosted",
  EnterpriseOnPrem = "enterprise-self-hosted",
  EnterpriseOnPremOffline = "enterprise-self-hosted-offline",
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
  workspaceLimit: null | number;
  workspacesUsed: number;
  dynamicSecret: boolean;
  memberLimit: null;
  membersUsed: number;
  identityLimit: null | number;
  identitiesUsed: number;
  subOrganization: boolean;
  environmentLimit: null | number;
  environmentsUsed: 0;
  secretVersioning: true;
  pitRecovery: boolean;
  ipAllowlisting: boolean;
  rbac: boolean;
  customRateLimits: boolean;
  customAlerts: boolean;
  auditLogs: boolean;
  auditLogsRetentionDays: number;
  auditLogStreams: boolean;
  auditLogStreamLimit: 3;
  githubOrgSync: boolean;
  samlSSO: boolean;
  enforceGoogleSSO: boolean;
  hsm: boolean;
  oidcSSO: boolean;
  secretAccessInsights: boolean;
  scim: boolean;
  ldap: boolean;
  groups: boolean;
  status: null;
  trial_end: null;
  has_used_trial: true;
  secretApproval: boolean;
  secretRotation: boolean;
  caCrl: false;
  instanceUserManagement: boolean;
  externalKms: boolean;
  rateLimits: {
    readLimit: number;
    writeLimit: number;
    secretsLimit: number;
  };
  pkiEst: boolean;
  pkiAcme: false;
  pkiScep: false;
  enforceMfa: false;
  projectTemplates: false;
  kmip: false;
  gateway: false;
  sshHostGroups: false;
  secretScanning: false;
  enterpriseSecretSyncs: false;
  enterpriseCertificateSyncs: false;
  enterpriseAppConnections: false;
  machineIdentityAuthTemplates: false;
  pkiLegacyTemplates: false;
  fips: boolean;
  eventSubscriptions: boolean;
  secretShareExternalBranding: boolean;
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
  Online = "online"
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
