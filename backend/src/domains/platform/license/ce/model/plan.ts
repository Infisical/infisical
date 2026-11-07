import { BadRequestError } from "@app/lib/errors";

import { InstanceType, TFeatureSet } from "./license-types";

// Flags that describe the instance, not an org. They are read with getInstanceEntitlements().
export type TInstanceOnlyFeature = "fips" | "instanceUserManagement";

// What an org is entitled to.
export type TPlan = Omit<TFeatureSet, TInstanceOnlyFeature>;

// The plan features that gate a capability, with the name a refusal shows the customer.
export const PLAN_FEATURE_NAMES = {
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
} as const satisfies Partial<Record<keyof TPlan, string>>;

export type TPlanFeature = keyof typeof PLAN_FEATURE_NAMES;

export class Plan {
  private constructor(private readonly features: TPlan) {}

  static restore(features: TPlan) {
    return new Plan(features);
  }

  has(feature: TPlanFeature): boolean {
    return Boolean(this.features[feature]);
  }

  assert(feature: TPlanFeature): void {
    if (!this.has(feature)) {
      throw new BadRequestError({
        message: `Your current plan does not include ${PLAN_FEATURE_NAMES[feature]}. Upgrade your plan to use it.`
      });
    }
  }

  // The member and identity cap that applies, or null when there is none. An enterprise plan is uncapped
  // unless it opts into enforcement.
  get enforcedIdentityLimit(): number | null {
    if (this.features.slug === "enterprise" && !this.features.enforceIdentityLimit) return null;
    return this.features.identityLimit ?? null;
  }
}

export type TInstanceEntitlements = {
  instanceType: InstanceType;
  // The features of the instance's own license. Self-hosted orgs get these as their plan.
  features: TFeatureSet;
  // The offline license's id and customer, when the instance runs on one.
  licenseId: string | null;
  customerId: string | null;
};

export const isSelfHostedLicensed = (instanceType: InstanceType) =>
  instanceType === InstanceType.EnterpriseOnPrem || instanceType === InstanceType.EnterpriseOnPremOffline;
