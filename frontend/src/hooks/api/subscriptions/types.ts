export enum SubscriptionProductCategory {
  Platform = "platform",
  SecretManager = "secret-manager",
  CertificateManager = "cert-manager",
  SecretScanning = "secret-scanning",
  PAM = "pam"
}

export type SubscriptionPlan = {
  _id: null;
  version: number;
  slug: string | null;
  productPlans: Record<string, string>;
  tier: -1;
  memberLimit: null;
  membersUsed: number;
  trial_end: null;
  has_used_trial: true;
  workspaceLimit: null;
  workspacesUsed: number;
  identityLimit: null;
  identitiesUsed: number;
  cardDeclined?: boolean;
  cardDeclinedReason?: string;
  cardDeclinedDays?: number;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | null;
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
  [SubscriptionProductCategory.PAM]: {
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
