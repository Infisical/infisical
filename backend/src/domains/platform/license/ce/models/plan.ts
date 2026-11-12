import { RuleViolationError } from "@app/domains/lib/errors";

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
  SecretsTemporaryAccess = "secretsTemporaryAccess"
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
  private readonly props: TPlanProps;

  private constructor(props: TPlanProps) {
    this.props = deepFreeze(structuredClone(props));
  }

  static restore(props: TPlanProps): Plan {
    return new Plan(props);
  }

  get slug(): string | null {
    return this.props.slug;
  }

  // No slug means community edition, or the fallback served while the License Server is down.
  get isPaid(): boolean {
    return Boolean(this.props.slug);
  }

  get isOffline(): boolean {
    return Boolean(this.props.isOffline);
  }

  get productPlans(): Readonly<TPlanProps["productPlans"]> {
    return this.props.productPlans;
  }

  get notices(): Readonly<TPlanProps["notices"]> {
    return this.props.notices;
  }

  get rateLimits(): Readonly<TPlanProps["rateLimits"]> {
    return this.props.rateLimits;
  }

  // Null keeps logs forever.
  get auditLogsRetentionDays(): number | null {
    return this.props.auditLogsRetentionDays;
  }

  get agentVaultSessionLogRetentionDays(): number | null {
    return this.props.agentVaultSessionLogRetentionDays;
  }

  has(feature: PlanFeature): boolean {
    return Boolean(this.props[feature]);
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
      // Enterprise is uncapped unless it opts into enforcement, and 0 has always meant no cap.
      case PlanLimit.Identities:
        if (this.props.slug === "enterprise" && !this.props.enforceIdentityLimit) return null;
        return this.props.identityLimit || null;
      // A contract granting more internal CAs than total CAs is a License Server misconfiguration, so the larger
      // grant wins. Only when both are numbers: the free tier caps maxCas at 1 and leaves maxInternalCas null.
      case PlanLimit.CertificateAuthorities: {
        const { maxCas, maxInternalCas } = this.props;
        return typeof maxCas === "number" && typeof maxInternalCas === "number"
          ? Math.max(maxCas, maxInternalCas)
          : (maxCas ?? null);
      }
      default: {
        // Offline v1 licenses carry a frozen feature snapshot, so a limit added since can be missing.
        const cap = this.props[name] as number | null | undefined;
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
    return this.props[product] !== false;
  }

  withWorkspacesUsed(workspacesUsed: number): Plan {
    return new Plan({ ...this.props, workspacesUsed });
  }

  // A mutable copy, for the cache and API responses.
  toJSON(): TPlanProps {
    return structuredClone(this.props);
  }
}
