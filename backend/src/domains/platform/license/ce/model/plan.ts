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
  tier: number;
  workspaceLimit: number | null;
  workspacesUsed: number;
  dynamicSecret: boolean;
  memberLimit: number | null;
  identityLimit: number | null;
  enforceIdentityLimit?: boolean;
  subOrganization: boolean;
  environmentLimit: number | null;
  environmentsUsed: number;
  secretVersioning: boolean;
  pitRecovery: boolean;
  ipAllowlisting: boolean;
  rbac: boolean;
  customAlerts: boolean;
  auditLogs: boolean;
  auditLogsRetentionDays: number | null;
  auditLogStreams: boolean;
  auditLogStreamLimit: number;
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
  externalKms: boolean;
  rateLimits: {
    readLimit: number;
    writeLimit: number;
    secretsLimit: number;
  };
  kmsPqc: boolean;
  enforceMfa: boolean;
  projectTemplates: boolean;
  kmip: boolean;
  gateway: boolean;
  gatewayPool: boolean;
  pamEnterpriseAlerting: boolean;
  secretScanning: boolean;
  enterpriseSecretSyncs: boolean;
  enterpriseAppConnections: boolean;
  machineIdentityAuthTemplates: boolean;
  eventSubscriptions: boolean;
  secretShareExternalBranding: boolean;
  honeyTokens: boolean;
  honeyTokenLimit: number;
  secretsBrokering: boolean;
  agentVaultByoS3: boolean;
  agentVaultManagedStorage: boolean;
  agentVaultSessionLogRetentionDays: number | null;
  secretSyncLimit: number | null;
  maxPamAccounts: number | null;

  // PKI / Cert Manager
  pkiAcme: boolean;
  pkiEst: boolean;
  pkiScep: boolean;
  pkiPqc: boolean;
  // caCrl defaults on, so self-hosted OSS keeps it; the License Server's free-plan default is what
  // withholds it on cloud.
  caCrl: boolean;
  pkiOcsp: boolean;
  pkiAwsKmsSigning: boolean;
  pkiEnterpriseCaIntegrations: boolean;
  pkiExternalIntermediateCa: boolean;
  pkiCrossSignedCa: boolean;
  pkiDiscovery: boolean;
  pkiEnterpriseAlerting: boolean;
  pkiApprovals: boolean;
  pkiSyncs: boolean;
  pkiLegacyTemplates: boolean;
  pkiCodeSigning: boolean;
  // maxCas covers every CA type, maxInternalCas covers INTERNAL only. Both enforced, whichever binds first.
  maxCas: number | null;
  maxInternalCas: number | null;
  maxCertificates: number | null;
  // Wildcards have no separate boolean gate: 0 means the plan does not include them at all, which is
  // how the free tier withholds them. A wildcard certificate counts against maxCertificates too.
  maxWildcardCertificates: number | null;
  maxSansPerCertificate: number | null;

  // Null when the plan says nothing, which leaves the product open; only an explicit false gates it.
  pam: boolean | null;
  certManager: boolean | null;
  secretsTemporaryAccess: boolean | null;
  enterprisePamAccount: boolean | null;
  crossProjectSecretSharing: boolean;
  secretsFolderRbac: boolean;
};

export type TPlanFeature = keyof typeof Plan.featureNames;

export class Plan extends withProps<TPlanProps>() {
  // Names shown to the customer when a feature is refused.
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

  // No slug means community edition, or the fallback served while the License Server is down.
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

  // Enterprise is uncapped unless it opts into enforcement.
  get enforcedIdentityLimit(): number | null {
    if (this.slug === "enterprise" && !this.enforceIdentityLimit) return null;
    return this.identityLimit ?? null;
  }

  withWorkspacesUsed(workspacesUsed: number): Plan {
    return new Plan({ ...this.toJSON(), workspacesUsed });
  }

  toJSON(): TPlanProps {
    return { ...this };
  }
}
