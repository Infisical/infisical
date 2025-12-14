import { SubscriptionProductCategory } from "@app/db/schemas";
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
  version: number;
  slug: string | null;
  productPlans: Record<string, string>;
  tier: -1;
  memberLimit: null;
  membersUsed: number;
  status: null;
  trial_end: null;
  has_used_trial: true;
  workspaceLimit: null;
  workspacesUsed: number;
  identityLimit: null;
  identitiesUsed: number;
  [SubscriptionProductCategory.Platform]: {
    ipAllowlisting: false;
    rbac: false;
    githubOrgSync: false;
    customRateLimits: false;
    subOrganization: false;
    secretScanning: false;
    enterpriseAppConnections: false;
    fips: false;
    eventSubscriptions: false;
    machineIdentityAuthTemplates: false;
    pam: false;
    ai: false;
    enforceMfa: boolean;
    projectTemplates: false;
    instanceUserManagement: false;
    externalKms: false;
    hsm: false;
    oidcSSO: false;
    gateway: false;
    scim: false;
    ldap: false;
    groups: false;
    auditLogs: false;
    auditLogsRetentionDays: number;
    auditLogStreams: false;
    auditLogStreamLimit: number;
    samlSSO: false;
    enforceGoogleSSO: false;
    rateLimits: {
      readLimit: number;
      writeLimit: number;
      secretsLimit: number;
    };
  };
  [SubscriptionProductCategory.SecretManager]: {
    enterpriseSecretSyncs: false;
    secretApproval: false;
    secretRotation: false;
    dynamicSecret: false;
    secretVersioning: true;
    secretAccessInsights: false;
    pitRecovery: false;
    identityLimit: number;
    identitiesUsed: number;
    environmentLimit: number;
    environmentsUsed: number;
    projectLimit: null;
    projectsUsed: number;
  };
  [SubscriptionProductCategory.CertificateManager]: {
    enterpriseCertificateSyncs: false;
    pkiEst: boolean;
    pkiAcme: false;
    kmip: false;
    pkiLegacyTemplates: false;
    caCrl: false;
    projectLimit: null;
    projectsUsed: number;
  };
  [SubscriptionProductCategory.Pam]: {
    sshHostGroups: false;
    identityLimit: null;
    identitiesUsed: number;
    projectLimit: null;
    projectsUsed: number;
  };
  [SubscriptionProductCategory.SecretScanning]: {
    sshHostGroups: false;
    identityLimit: null;
    identitiesUsed: number;
    projectLimit: null;
    projectsUsed: number;
  };
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

export type TUpdateOrgProductToPro = TOrgPermission & {
  product: SubscriptionProductCategory;
};

export type TGetMySubscriptionMetrics = {
  orgPermission: TOrgPermission;
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
