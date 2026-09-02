import { TOrgPermission } from "@app/lib/types";
import { TEntitlementsResponse } from "@app/services/license-client/license-client-types";

export enum InstanceType {
  OnPrem = "self-hosted",
  // Self-hosted online license: features are resolved from License Server v2.
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
  // v1 (or absent) offline licenses carry the legacy feature-flag set directly; version 2 licenses
  // carry License Server v2 entitlements, which we project into the same feature shape.
  version?: number;
  features: TFeatureSet;
  entitlements?: TEntitlementsResponse;
};

export type TOrgSeatUsage = {
  membersUsed: number;
  identitiesUsed: number;
};

export type TFeatureSet = {
  _id: null;
  slug: string | null;
  // True when features are sourced from an offline (air-gapped) license; the billing UI renders a
  // read-only offline banner instead of the live billing surface.
  isOffline?: boolean;
  tier: -1;
  workspaceLimit: null;
  workspacesUsed: number;
  dynamicSecret: false;
  memberLimit: null;
  identityLimit: null;
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
  instanceUserManagement: false;
  externalKms: false;
  rateLimits: {
    readLimit: number;
    writeLimit: number;
    secretsLimit: number;
  };
  kmsPqc: false;
  enforceMfa: false;
  projectTemplates: false;
  kmip: false;
  gateway: false;
  gatewayPool: false;
  pamSlackNotifications: boolean;
  secretScanning: false;
  enterpriseSecretSyncs: false;
  enterpriseAppConnections: false;
  machineIdentityAuthTemplates: false;
  fips: false;
  eventSubscriptions: false;
  secretShareExternalBranding: false;
  honeyTokens: false;
  honeyTokenLimit: 0;
  secretsBrokering: true;
  secretSyncLimit: null;
  maxPamAccounts: null;

  // PKI / Cert Manager
  pkiAcme: true;
  pkiEst: boolean;
  pkiScep: false;
  pkiPqc: false;
  // caCrl and pkiWildcardSans default on, so self-hosted OSS keeps them; the License Server's free-plan
  // default is what withholds them on cloud.
  caCrl: boolean;
  pkiWildcardSans: boolean;
  pkiEnterpriseCaIntegrations: false;
  pkiExternalIntermediateCa: false;
  pkiDiscovery: false;
  pkiEnterpriseAlerting: false;
  pkiApprovals: false;
  pkiSyncs: false;
  pkiLegacyTemplates: false;
  pkiCodeSigning: false;
  maxInternalCas: null;
  // Declared for the License Server plan map; enforcement lands with the CA/certificate counting work.
  maxSansPerCertificate: null;

  pam: null;
  certManager: null;
  secretsTemporaryAccess: null;
  enterprisePamAccount: null;
  crossProjectSecretSharing: false;
  secretsFolderRbac: false;
};

export type TOrgPlanDTO = {
  projectId?: string;
  refreshCache?: boolean;
  rootOrgId: string;
} & TOrgPermission;

export enum LicenseType {
  Offline = "offline",
  // Self-hosted online license key; resolves entitlements from License Server v2.
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
