export enum SubscriptionPlanTypes {
  Starter = "starter",
  Pro = "pro",
  ProAnnual = "pro-annual",
  Advanced = "advanced",
  Team = "team",
  TeamAnnual = "team-annual",
  Enterprise = "enterprise",
  OnPrem = "one-prem",
  OnPremEnterprise = "one-prem-enterprise"
}

export type SubscriptionPlan = {
  id: string;
  memberLimit: number;
  identityLimit: number;
  auditLogs: boolean;
  dynamicSecret: boolean;
  auditLogsRetentionDays: number;
  auditLogStreamLimit: number;
  auditLogStreams: boolean;
  customAlerts: boolean;
  customRateLimits: boolean;
  pitRecovery: boolean;
  githubOrgSync: boolean;
  subOrganization?: boolean;
  ipAllowlisting: boolean;
  rbac: boolean;
  secretVersioning: boolean;
  slug: SubscriptionPlanTypes;
  isOffline?: boolean;
  secretApproval: boolean;
  secretRotation: boolean;
  tier: number;
  workspaceLimit: number;
  workspacesUsed: number;
  environmentLimit: number;
  samlSSO: boolean;
  secretAccessInsights: boolean;
  auditReports: boolean;
  hsm: boolean;
  oidcSSO: boolean;
  scim: boolean;
  ldap: boolean;
  groups: boolean;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | null;
  trial_end: number | null;
  has_used_trial: boolean;
  instanceUserManagement: boolean;
  gateway: boolean;
  gatewayPool: boolean;
  pamSlackNotifications: boolean;
  externalKms: boolean;
  // PKI / Cert Manager. The /plan route returns z.any(), so nothing enforces that this mirrors
  // the backend's TFeatureSet.
  pkiAcme: boolean;
  pkiEst: boolean;
  pkiScep: boolean;
  pkiPqc: boolean;
  caCrl: boolean;
  pkiEnterpriseCaIntegrations: boolean;
  pkiExternalIntermediateCa: boolean;
  pkiDiscovery: boolean;
  pkiEnterpriseAlerting: boolean;
  pkiApprovals: boolean;
  pkiSyncs: boolean;
  pkiLegacyTemplates: boolean;
  pkiCodeSigning: boolean;
  // maxCas caps every CA type, maxInternalCas caps INTERNAL only. Both enforced.
  maxCas: number | null;
  maxInternalCas: number | null;
  maxCertificates: number | null;
  // 0 means the plan has no wildcard support; wildcards also count toward maxCertificates.
  maxWildcardCertificates: number | null;
  maxSansPerCertificate: number | null;
  kmsPqc: boolean;
  enforceMfa: boolean;
  enforceGoogleSSO: boolean;
  projectTemplates: boolean;
  kmip: boolean;
  secretScanning: boolean;
  enterpriseSecretSyncs: boolean;
  enterpriseAppConnections: boolean;
  cardDeclined?: boolean;
  cardDeclinedReason?: string;
  cardDeclinedDays?: number;
  machineIdentityAuthTemplates: boolean;
  secretShareExternalBranding: boolean;
  emailDomainVerification: boolean;
  honeyTokens: boolean;
  honeyTokenLimit: number;
  secretsBrokering: boolean;
  pam?: boolean | null;
  certManager?: boolean | null;
  secretsFolderRbac: boolean;
};
