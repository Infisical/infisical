import { RuleViolationError } from "@app/domains/lib/errors";
import { withProps } from "@app/domains/lib/with-props";

export type TPlanNotice = {
  type: "trial_payment_failed";
  productKey: string;
  trialPlanKey: string | null;
  accessEndsAt: string;
  nextAttemptAt: string | null;
  cause: string | null;
};

export type TPlanProps = {
  _id: null;
  slug: string | null;
  productPlans?: {
    productKey: string;
    planKey: string | null;
    status: string | null;
    trialPlanKey: string | null;
    trialEndsAt: string | null;
  }[];
  notices?: TPlanNotice[];
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
  customAlerts: false;
  auditLogs: false;
  auditLogsRetentionDays: number | null;
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
  pamEnterpriseAlerting: boolean;
  secretScanning: false;
  enterpriseSecretSyncs: false;
  enterpriseAppConnections: false;
  machineIdentityAuthTemplates: false;
  eventSubscriptions: false;
  secretShareExternalBranding: false;
  honeyTokens: false;
  honeyTokenLimit: 0;
  secretsBrokering: true;
  agentVaultByoS3: false;
  agentVaultManagedStorage: boolean;
  agentVaultSessionLogRetentionDays: number | null;
  secretSyncLimit: null;
  maxPamAccounts: null;

  // PKI / Cert Manager
  pkiAcme: true;
  pkiEst: boolean;
  pkiScep: false;
  pkiPqc: false;
  // caCrl defaults on, so self-hosted OSS keeps it; the License Server's free-plan default is what
  // withholds it on cloud.
  caCrl: boolean;
  pkiOcsp: false;
  pkiAwsKmsSigning: false;
  pkiEnterpriseCaIntegrations: false;
  pkiExternalIntermediateCa: false;
  pkiCrossSignedCa: false;
  pkiDiscovery: false;
  pkiEnterpriseAlerting: false;
  pkiApprovals: false;
  pkiSyncs: false;
  pkiLegacyTemplates: false;
  pkiCodeSigning: false;
  // maxCas covers every CA type, maxInternalCas covers INTERNAL only. Both enforced, whichever binds
  // first. Typed number | null rather than the literal null the flags above use, so consumers can
  // name the limit in an error without casting.
  maxCas: number | null;
  maxInternalCas: number | null;
  maxCertificates: number | null;
  // Wildcards have no separate boolean gate: 0 means the plan does not include them at all, which is
  // how the free tier withholds them. A wildcard certificate counts against maxCertificates too.
  maxWildcardCertificates: number | null;
  maxSansPerCertificate: number | null;

  pam: null;
  certManager: null;
  secretsTemporaryAccess: null;
  enterprisePamAccount: null;
  crossProjectSecretSharing: false;
  secretsFolderRbac: false;
};

export type TPlanFeature = keyof typeof Plan.featureNames;

export class Plan extends withProps<TPlanProps>() {
  // The plan features that gate a capability, with the name a refusal shows the customer.
  static readonly featureNames = {
    dynamicSecret: "Dynamic Secrets",
    subOrganization: "Sub-organizations",
    pitRecovery: "Point-in-time Recovery",
    ipAllowlisting: "IP Allowlisting",
    rbac: "Role-based Access Control",
    customAlerts: "Custom Alerts",
    auditLogs: "Audit Logs",
    auditLogStreams: "Audit Log Streams",
    githubOrgSync: "GitHub Organization Sync",
    samlSSO: "SAML SSO",
    enforceGoogleSSO: "Google SSO Enforcement",
    hsm: "HSM",
    oidcSSO: "OIDC SSO",
    secretAccessInsights: "Secret Access Insights",
    scim: "SCIM",
    ldap: "LDAP",
    groups: "Groups",
    secretApproval: "Secret Approvals",
    secretRotation: "Secret Rotation",
    externalKms: "External KMS",
    kmsPqc: "Post-quantum KMS Keys",
    enforceMfa: "MFA Enforcement",
    projectTemplates: "Project Templates",
    kmip: "KMIP",
    gateway: "Gateways",
    gatewayPool: "Gateway Pools",
    pamEnterpriseAlerting: "PAM Alerting",
    secretScanning: "Secret Scanning",
    enterpriseSecretSyncs: "Enterprise Secret Syncs",
    enterpriseAppConnections: "Enterprise App Connections",
    machineIdentityAuthTemplates: "Machine Identity Auth Templates",
    eventSubscriptions: "Event Subscriptions",
    secretShareExternalBranding: "Secret Sharing Branding",
    honeyTokens: "Honey Tokens",
    secretsBrokering: "Secrets Brokering",
    agentVaultByoS3: "Agent Vault Bring-your-own Storage",
    agentVaultManagedStorage: "Agent Vault Managed Storage",
    pkiEst: "EST Enrollment",
    pkiScep: "SCEP Enrollment",
    pkiPqc: "Post-quantum Certificates",
    pkiOcsp: "OCSP",
    pkiAwsKmsSigning: "AWS KMS Certificate Signing",
    pkiEnterpriseCaIntegrations: "Enterprise CA Integrations",
    pkiExternalIntermediateCa: "External Intermediate CAs",
    pkiCrossSignedCa: "Cross-signed CAs",
    pkiDiscovery: "Certificate Discovery",
    pkiEnterpriseAlerting: "Certificate Alerting",
    pkiApprovals: "Certificate Approvals",
    pkiSyncs: "Certificate Syncs",
    pkiCodeSigning: "Code Signing",
    crossProjectSecretSharing: "Cross-project Secret Sharing",
    secretsFolderRbac: "Folder-level Access Control"
  } as const satisfies Partial<Record<keyof TPlanProps, string>>;

  private constructor(props: TPlanProps) {
    super(props);
  }

  static restore(props: TPlanProps): Plan {
    return new Plan(props);
  }

  // A plan with a License Server answer on it. A plan with no slug is the community edition, or the
  // fallback served while the License Server cannot be reached.
  get isPaid(): boolean {
    return Boolean(this.slug);
  }

  has(feature: TPlanFeature): boolean {
    return Boolean(this[feature]);
  }

  assert(feature: TPlanFeature): void {
    if (!this.has(feature)) {
      throw new RuleViolationError({
        message: `Your current plan does not include ${Plan.featureNames[feature]}. Upgrade your plan to use it.`
      });
    }
  }

  // The member and identity cap that applies, or null when there is none. An enterprise plan is uncapped
  // unless it opts into enforcement.
  get enforcedIdentityLimit(): number | null {
    if (this.slug === "enterprise" && !this.enforceIdentityLimit) return null;
    return this.identityLimit ?? null;
  }

  // The plan as shown to an org: the License Server's answer plus the workspaces the org uses now.
  withWorkspacesUsed(workspacesUsed: number): Plan {
    return new Plan({ ...this.toJSON(), workspacesUsed });
  }

  toJSON(): TPlanProps {
    return { ...this };
  }
}
