export type SubscriptionPlan = {
  productPlans: Record<string, string>;
  id: string;
  membersUsed: number;
  memberLimit: number;
  identitiesUsed: number;
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
  slug: string;
  secretApproval: boolean;
  secretRotation: boolean;
  tier: number;
  workspaceLimit: number;
  workspacesUsed: number;
  environmentLimit: number;
  samlSSO: boolean;
  sshHostGroups: boolean;
  secretAccessInsights: boolean;
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
  caCrl: boolean;
  instanceUserManagement: boolean;
  gateway: boolean;
  externalKms: boolean;
  pkiEst: boolean;
  pkiAcme: boolean;
  pkiLegacyTemplates: boolean;
  enforceMfa: boolean;
  enforceGoogleSSO: boolean;
  projectTemplates: boolean;
  kmip: boolean;
  secretScanning: boolean;
  enterpriseSecretSyncs: boolean;
  enterpriseCertificateSyncs: boolean;
  enterpriseAppConnections: boolean;
  cardDeclined?: boolean;
  cardDeclinedReason?: string;
  cardDeclinedDays?: number;
  machineIdentityAuthTemplates: boolean;
  pam: boolean;
  ai: boolean;
};

export enum SubscriptionProducts {
  Platform = "platform",
  SecretManager = "secret-manager",
  CertificateManager = "cert-manager",
  SecretScanning = "secret-scanning",
  PAM = "pam"
}
