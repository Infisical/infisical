import { RuleViolationError } from "@app/domains/lib/errors";

export type TPlanNotice = {
  type: "trial_payment_failed";
  productKey: string;
  trialPlanKey: string | null;
  accessEndsAt: string;
  nextAttemptAt: string | null;
  cause: string | null;
};

export type TPlanFeatures = {
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
  // Offline (air-gapped) license: the billing UI shows a read-only banner instead of live billing.
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
  agentVaultHooks: boolean;
  secretSyncLimit: number | null;
  maxPamAccounts: number | null;

  pkiAcme: boolean;
  pkiEst: boolean;
  pkiScep: boolean;
  pkiPqc: boolean;
  // On by default so self-hosted OSS keeps it; on cloud the License Server's free-plan default withholds it.
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
  // No boolean gate: 0 means not included (how the free tier withholds them). Wildcards count against
  // maxCertificates too.
  maxWildcardCertificates: number | null;
  maxSansPerCertificate: number | null;

  // Null when the plan says nothing, which leaves the product open; only an explicit false gates it.
  pam: boolean | null;
  agentVault: boolean | null;
  certManager: boolean | null;
  secretsTemporaryAccess: boolean | null;
  enterprisePamAccount: boolean | null;
  crossProjectSecretSharing: boolean;
  secretsFolderRbac: boolean;
};

// Each value is the plan field holding that flag.
export enum PlanFeature {
  DynamicSecret = "dynamicSecret",
  SubOrganization = "subOrganization",
  PitRecovery = "pitRecovery",
  IpAllowlisting = "ipAllowlisting",
  Rbac = "rbac",
  CustomAlerts = "customAlerts",
  AuditLogs = "auditLogs",
  AuditLogStreams = "auditLogStreams",
  GithubOrgSync = "githubOrgSync",
  SamlSso = "samlSSO",
  EnforceGoogleSso = "enforceGoogleSSO",
  Hsm = "hsm",
  OidcSso = "oidcSSO",
  SecretAccessInsights = "secretAccessInsights",
  Scim = "scim",
  Ldap = "ldap",
  Groups = "groups",
  SecretApproval = "secretApproval",
  SecretRotation = "secretRotation",
  ExternalKms = "externalKms",
  KmsPqc = "kmsPqc",
  EnforceMfa = "enforceMfa",
  ProjectTemplates = "projectTemplates",
  Kmip = "kmip",
  Gateway = "gateway",
  GatewayPool = "gatewayPool",
  PamEnterpriseAlerting = "pamEnterpriseAlerting",
  SecretScanning = "secretScanning",
  EnterpriseSecretSyncs = "enterpriseSecretSyncs",
  EnterpriseAppConnections = "enterpriseAppConnections",
  MachineIdentityAuthTemplates = "machineIdentityAuthTemplates",
  EventSubscriptions = "eventSubscriptions",
  SecretShareExternalBranding = "secretShareExternalBranding",
  HoneyTokens = "honeyTokens",
  SecretsBrokering = "secretsBrokering",
  AgentVaultByoS3 = "agentVaultByoS3",
  AgentVaultManagedStorage = "agentVaultManagedStorage",
  AgentVaultHooks = "agentVaultHooks",
  PkiEst = "pkiEst",
  PkiScep = "pkiScep",
  PkiPqc = "pkiPqc",
  PkiOcsp = "pkiOcsp",
  PkiAwsKmsSigning = "pkiAwsKmsSigning",
  PkiEnterpriseCaIntegrations = "pkiEnterpriseCaIntegrations",
  PkiExternalIntermediateCa = "pkiExternalIntermediateCa",
  PkiCrossSignedCa = "pkiCrossSignedCa",
  PkiDiscovery = "pkiDiscovery",
  PkiEnterpriseAlerting = "pkiEnterpriseAlerting",
  PkiApprovals = "pkiApprovals",
  PkiSyncs = "pkiSyncs",
  PkiCodeSigning = "pkiCodeSigning",
  CrossProjectSecretSharing = "crossProjectSecretSharing",
  SecretsFolderRbac = "secretsFolderRbac",
  CaCrl = "caCrl"
}

// Products a plan can switch off. Unlike a feature, a product the plan says nothing about (null) stays available.
export enum PlanProduct {
  Pam = "pam",
  PamEnterpriseAccounts = "enterprisePamAccount",
  CertManager = "certManager",
  SecretsTemporaryAccess = "secretsTemporaryAccess",
  AgentVault = "agentVault"
}

// Each value is the plan field holding that cap.
export enum PlanLimit {
  Projects = "workspaceLimit",
  Identities = "identityLimit",
  Environments = "environmentLimit",
  AuditLogStreams = "auditLogStreamLimit",
  HoneyTokens = "honeyTokenLimit",
  SecretSyncs = "secretSyncLimit",
  PamAccounts = "maxPamAccounts",
  CertificateAuthorities = "maxCas",
  InternalCertificateAuthorities = "maxInternalCas",
  Certificates = "maxCertificates",
  WildcardCertificates = "maxWildcardCertificates",
  SansPerCertificate = "maxSansPerCertificate"
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

export class Plan {
  // Names shown to the customer when a feature is refused.
  static readonly featureNames: Record<PlanFeature, string> = {
    [PlanFeature.DynamicSecret]: "Dynamic Secrets",
    [PlanFeature.SubOrganization]: "Sub-organizations",
    [PlanFeature.PitRecovery]: "Point-in-time Recovery",
    [PlanFeature.IpAllowlisting]: "IP Allowlisting",
    [PlanFeature.Rbac]: "Role-based Access Control",
    [PlanFeature.CustomAlerts]: "Custom Alerts",
    [PlanFeature.AuditLogs]: "Audit Logs",
    [PlanFeature.AuditLogStreams]: "Audit Log Streams",
    [PlanFeature.GithubOrgSync]: "GitHub Organization Sync",
    [PlanFeature.SamlSso]: "SAML SSO",
    [PlanFeature.EnforceGoogleSso]: "Google SSO Enforcement",
    [PlanFeature.Hsm]: "HSM",
    [PlanFeature.OidcSso]: "OIDC SSO",
    [PlanFeature.SecretAccessInsights]: "Secret Access Insights",
    [PlanFeature.Scim]: "SCIM",
    [PlanFeature.Ldap]: "LDAP",
    [PlanFeature.Groups]: "Groups",
    [PlanFeature.SecretApproval]: "Secret Approvals",
    [PlanFeature.SecretRotation]: "Secret Rotation",
    [PlanFeature.ExternalKms]: "External KMS",
    [PlanFeature.KmsPqc]: "Post-quantum KMS Keys",
    [PlanFeature.EnforceMfa]: "MFA Enforcement",
    [PlanFeature.ProjectTemplates]: "Project Templates",
    [PlanFeature.Kmip]: "KMIP",
    [PlanFeature.Gateway]: "Gateways",
    [PlanFeature.GatewayPool]: "Gateway Pools",
    [PlanFeature.PamEnterpriseAlerting]: "PAM Alerting",
    [PlanFeature.SecretScanning]: "Secret Scanning",
    [PlanFeature.EnterpriseSecretSyncs]: "Enterprise Secret Syncs",
    [PlanFeature.EnterpriseAppConnections]: "Enterprise App Connections",
    [PlanFeature.MachineIdentityAuthTemplates]: "Machine Identity Auth Templates",
    [PlanFeature.EventSubscriptions]: "Event Subscriptions",
    [PlanFeature.SecretShareExternalBranding]: "Secret Sharing Branding",
    [PlanFeature.HoneyTokens]: "Honey Tokens",
    [PlanFeature.SecretsBrokering]: "Secrets Brokering",
    [PlanFeature.AgentVaultByoS3]: "Agent Vault Bring-your-own Storage",
    [PlanFeature.AgentVaultManagedStorage]: "Agent Vault Managed Storage",
    [PlanFeature.AgentVaultHooks]: "Agent Vault Hooks",
    [PlanFeature.PkiEst]: "EST Enrollment",
    [PlanFeature.PkiScep]: "SCEP Enrollment",
    [PlanFeature.PkiPqc]: "Post-quantum Certificates",
    [PlanFeature.PkiOcsp]: "OCSP",
    [PlanFeature.PkiAwsKmsSigning]: "AWS KMS Certificate Signing",
    [PlanFeature.PkiEnterpriseCaIntegrations]: "Enterprise CA Integrations",
    [PlanFeature.PkiExternalIntermediateCa]: "External Intermediate CAs",
    [PlanFeature.PkiCrossSignedCa]: "Cross-signed CAs",
    [PlanFeature.PkiDiscovery]: "Certificate Discovery",
    [PlanFeature.PkiEnterpriseAlerting]: "Certificate Alerting",
    [PlanFeature.PkiApprovals]: "Certificate Approvals",
    [PlanFeature.PkiSyncs]: "Certificate Syncs",
    [PlanFeature.PkiCodeSigning]: "Code Signing",
    [PlanFeature.CrossProjectSecretSharing]: "Cross-project Secret Sharing",
    [PlanFeature.SecretsFolderRbac]: "Folder-level Access Control",
    [PlanFeature.CaCrl]: "Certificate Revocation Lists"
  };

  // Cloned so freezing never reaches the caller's object (the instance features, a test's fixture).
  private readonly features: TPlanFeatures;

  private constructor(
    features: TPlanFeatures,
    // Not part of the features, so it never reaches the cache or an API response.
    private readonly fallback = false
  ) {
    this.features = deepFreeze(structuredClone(features));
  }

  static restore(features: TPlanFeatures): Plan {
    return new Plan(features);
  }

  get slug(): string | null {
    return this.features.slug;
  }

  // No slug means community edition, or the fallback served while the License Server is down.
  get isPaid(): boolean {
    return Boolean(this.features.slug);
  }

  // A stand-in served because the License Server, the database or the key store couldn't answer, not the org's
  // real plan. Decisions that would stop something the org pays for should look at its last known plan instead.
  get isFallback(): boolean {
    return this.fallback;
  }

  asFallback(): Plan {
    return new Plan(this.features, true);
  }

  get isOffline(): boolean {
    return Boolean(this.features.isOffline);
  }

  get productPlans(): Readonly<TPlanFeatures["productPlans"]> {
    return this.features.productPlans;
  }

  get notices(): Readonly<TPlanFeatures["notices"]> {
    return this.features.notices;
  }

  get rateLimits(): Readonly<TPlanFeatures["rateLimits"]> {
    return this.features.rateLimits;
  }

  // Null keeps logs forever.
  get auditLogsRetentionDays(): number | null {
    return this.features.auditLogsRetentionDays;
  }

  get agentVaultSessionLogRetentionDays(): number | null {
    return this.features.agentVaultSessionLogRetentionDays;
  }

  has(feature: PlanFeature): boolean {
    return Boolean(this.features[feature]);
  }

  assert(feature: PlanFeature): void {
    if (!this.has(feature)) {
      throw new RuleViolationError({
        message: `Your current plan does not include ${Plan.featureNames[feature]}. Upgrade your plan to use it.`
      });
    }
  }

  // The cap this plan enforces, or null when it has none.
  limit(name: PlanLimit): number | null {
    switch (name) {
      // Enterprise is uncapped unless it opts into enforcement; 0 has always meant no cap.
      case PlanLimit.Identities:
        if (this.features.slug === "enterprise" && !this.features.enforceIdentityLimit) return null;
        return this.features.identityLimit || null;
      // More internal CAs than total is a License Server misconfig, so the larger wins (free tier sets only maxCas).
      case PlanLimit.CertificateAuthorities: {
        const { maxCas, maxInternalCas } = this.features;
        return typeof maxCas === "number" && typeof maxInternalCas === "number"
          ? Math.max(maxCas, maxInternalCas)
          : (maxCas ?? null);
      }
      default: {
        // Offline v1 licenses are a frozen snapshot, so a newer limit can be missing.
        const cap = this.features[name] as number | null | undefined;
        return typeof cap === "number" ? cap : null;
      }
    }
  }

  isLimited(name: PlanLimit): boolean {
    return this.limit(name) !== null;
  }

  // Whether `adding` more on top of `used` goes past the cap. adding 0 asks whether usage is already over it.
  exceeds(name: PlanLimit, used: number, adding = 1): boolean {
    const cap = this.limit(name);
    return cap !== null && used + adding > cap;
  }

  // Whether the plan leaves this product available: only an explicit false switches it off.
  allows(product: PlanProduct): boolean {
    return this.features[product] !== false;
  }

  // Whether the plan explicitly includes this product, as a purchase or an override does. Null proves nothing.
  grants(product: PlanProduct): boolean {
    return this.features[product] === true;
  }

  withWorkspacesUsed(workspacesUsed: number): Plan {
    return new Plan({ ...this.features, workspacesUsed }, this.fallback);
  }

  // A mutable copy, for the cache and API responses.
  toJSON(): TPlanFeatures {
    return structuredClone(this.features);
  }
}
