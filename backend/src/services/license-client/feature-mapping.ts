import { ActiveCerts, AuditRetentionDays, IdentitiesMeter, InternalCas, SsoEnforcement } from "./features";

export type TFeatureMapping = {
  // Must match a License Server feature registry key (a separate repo); a wrong key means the feature
  // is never projected onto the plan.
  v2Key: string;
  // The TFeatureSet field this maps to (drives the completeness test); dotted for nested fields
  // (e.g. "rateLimits.readLimit"). null when the feature has no plan field to write.
  v1Field: string | null;
};

// Org-wide capabilities that are not tied to a single product: identity and access, audit, KMS/HSM,
// gateways, instance controls, and the org-level caps and rate limits.
const platformMappings: TFeatureMapping[] = [
  {
    // v2's `identities` is a usage meter (reported count); the identity cap is a separate v2 feature
    // (max_identity_limit) mapped below, so the meter itself maps to no v1 field.
    v2Key: IdentitiesMeter.key,
    v1Field: null
  },
  {
    v2Key: AuditRetentionDays.key,
    v1Field: "auditLogsRetentionDays"
  },
  {
    // v2's sso_enforcement is the general "can enforce SSO" entitlement; v1 has no single field for it
    // (SAML/OIDC enforcement rides on the samlSSO/oidcSSO capabilities, Google on enforceGoogleSSO).
    v2Key: SsoEnforcement.key,
    v1Field: null
  },
  {
    v2Key: "rbac",
    v1Field: "rbac"
  },
  {
    v2Key: "groups",
    v1Field: "groups"
  },
  {
    v2Key: "ip_allowlisting",
    v1Field: "ipAllowlisting"
  },
  {
    v2Key: "saml_sso",
    v1Field: "samlSSO"
  },
  {
    v2Key: "oidc_sso",
    v1Field: "oidcSSO"
  },
  {
    v2Key: "ldap",
    v1Field: "ldap"
  },
  {
    v2Key: "scim",
    v1Field: "scim"
  },
  {
    v2Key: "enforce_google_sso",
    v1Field: "enforceGoogleSSO"
  },
  {
    v2Key: "enforce_mfa",
    v1Field: "enforceMfa"
  },
  {
    v2Key: "github_org_sync",
    v1Field: "githubOrgSync"
  },
  {
    v2Key: "machine_identity_auth_templates",
    v1Field: "machineIdentityAuthTemplates"
  },
  {
    v2Key: "sub_organization",
    v1Field: "subOrganization"
  },
  {
    v2Key: "instance_user_management",
    v1Field: "instanceUserManagement"
  },
  {
    v2Key: "project_templates",
    v1Field: "projectTemplates"
  },
  {
    v2Key: "event_subscriptions",
    v1Field: "eventSubscriptions"
  },
  {
    // App connections back secret syncs, rotations, cert syncs and PAM, so they are platform-level.
    v2Key: "enterprise_app_connections",
    v1Field: "enterpriseAppConnections"
  },
  {
    v2Key: "audit_logs",
    v1Field: "auditLogs"
  },
  {
    v2Key: "audit_log_streams",
    v1Field: "auditLogStreams"
  },
  {
    v2Key: "hsm",
    v1Field: "hsm"
  },
  {
    v2Key: "external_kms",
    v1Field: "externalKms"
  },
  {
    v2Key: "kms_pqc",
    v1Field: "kmsPqc"
  },
  {
    v2Key: "kmip",
    v1Field: "kmip"
  },
  {
    v2Key: "fips",
    v1Field: "fips"
  },
  {
    v2Key: "gateway",
    v1Field: "gateway"
  },
  {
    v2Key: "gateway_pool",
    v1Field: "gatewayPool"
  },
  {
    v2Key: "custom_rate_limits",
    v1Field: "customRateLimits"
  },
  {
    v2Key: "custom_alerts",
    v1Field: "customAlerts"
  },
  {
    v2Key: "environment_limit",
    v1Field: "environmentLimit"
  },
  {
    // Max identities allowed. Dedicated cap feature, separate from the `identities` usage meter.
    v2Key: "max_identity_limit",
    v1Field: "identityLimit"
  },
  {
    v2Key: "audit_log_stream_limit",
    v1Field: "auditLogStreamLimit"
  },
  {
    v2Key: "read_rate_limit",
    v1Field: "rateLimits.readLimit"
  },
  {
    v2Key: "write_rate_limit",
    v1Field: "rateLimits.writeLimit"
  },
  {
    v2Key: "secrets_rate_limit",
    v1Field: "rateLimits.secretsLimit"
  }
];

// Secrets Management: secret storage capabilities, syncs, sharing, scanning, and their caps.
const secretManagerMappings: TFeatureMapping[] = [
  {
    v2Key: "secret_versioning",
    v1Field: "secretVersioning"
  },
  {
    v2Key: "pit_recovery",
    v1Field: "pitRecovery"
  },
  {
    v2Key: "dynamic_secret",
    v1Field: "dynamicSecret"
  },
  {
    v2Key: "secret_approval",
    v1Field: "secretApproval"
  },
  {
    v2Key: "secret_rotation",
    v1Field: "secretRotation"
  },
  {
    v2Key: "secret_access_insights",
    v1Field: "secretAccessInsights"
  },
  {
    v2Key: "secrets_temporary_access",
    v1Field: "secretsTemporaryAccess"
  },
  {
    v2Key: "secret_scanning",
    v1Field: "secretScanning"
  },
  {
    v2Key: "secrets_brokering",
    v1Field: "secretsBrokering"
  },
  {
    v2Key: "enterprise_secret_syncs",
    v1Field: "enterpriseSecretSyncs"
  },
  {
    v2Key: "secret_share_external_branding",
    v1Field: "secretShareExternalBranding"
  },
  {
    v2Key: "cross_project_secret_sharing",
    v1Field: "crossProjectSecretSharing"
  },
  {
    v2Key: "honey_tokens",
    v1Field: "honeyTokens"
  },
  {
    // null (v1 default) means uncapped.
    v2Key: "secret_sync_limit",
    v1Field: "secretSyncLimit"
  },
  {
    v2Key: "honey_token_limit",
    v1Field: "honeyTokenLimit"
  },
  {
    v2Key: "secrets_folder_rbac",
    v1Field: "secretsFolderRbac"
  }
];

// Cert Manager / PKI: the product entitlement, enrollment protocols, cert syncs, and CA caps and meters.
const certManagerMappings: TFeatureMapping[] = [
  {
    v2Key: "cert_manager",
    v1Field: "certManager"
  },
  {
    v2Key: "ca_crl",
    v1Field: "caCrl"
  },
  {
    v2Key: "pki_est",
    v1Field: "pkiEst"
  },
  {
    v2Key: "pki_acme",
    v1Field: "pkiAcme"
  },
  {
    v2Key: "pki_scep",
    v1Field: "pkiScep"
  },
  {
    v2Key: "pki_pqc",
    v1Field: "pkiPqc"
  },
  {
    v2Key: "pki_code_signing",
    v1Field: "pkiCodeSigning"
  },
  {
    // Defaults on, so the free plan has to send false; the features below default off instead.
    v2Key: "pki_wildcard_sans",
    v1Field: "pkiWildcardSans"
  },
  {
    v2Key: "pki_enterprise_ca_integrations",
    v1Field: "pkiEnterpriseCaIntegrations"
  },
  {
    v2Key: "pki_external_intermediate_ca",
    v1Field: "pkiExternalIntermediateCa"
  },
  {
    v2Key: "pki_discovery",
    v1Field: "pkiDiscovery"
  },
  {
    v2Key: "pki_enterprise_alerting",
    v1Field: "pkiEnterpriseAlerting"
  },
  {
    v2Key: "pki_approvals",
    v1Field: "pkiApprovals"
  },
  {
    v2Key: "pki_syncs",
    v1Field: "pkiSyncs"
  },
  {
    // Declared for completeness; enforcement lands with the CA/certificate counting work.
    v2Key: "max_sans_per_certificate",
    v1Field: "maxSansPerCertificate"
  },
  {
    // v2's `internal_cas` is a usage meter; the internal-CA cap is a separate v2 feature
    // (max_internal_cas) mapped below, so the meter itself maps to no v1 field.
    v2Key: InternalCas.key,
    v1Field: null
  },
  {
    v2Key: ActiveCerts.key,
    v1Field: null
  },
  {
    // Max internal CAs allowed. Dedicated cap feature, separate from the `internal_cas` usage meter.
    v2Key: "max_internal_cas",
    v1Field: "maxInternalCas"
  }
];

// PAM: the product entitlement, its add-ons, and the account cap.
const pamMappings: TFeatureMapping[] = [
  {
    v2Key: "pam",
    v1Field: "pam"
  },
  {
    v2Key: "enterprise_pam_account",
    v1Field: "enterprisePamAccount"
  },
  {
    v2Key: "pam_slack_notifications",
    v1Field: "pamSlackNotifications"
  },
  {
    // Max PAM accounts allowed. null (v1 default) means uncapped.
    v2Key: "max_pam_accounts",
    v1Field: "maxPamAccounts"
  }
];

export const FEATURE_MAPPINGS: TFeatureMapping[] = [
  ...platformMappings,
  ...secretManagerMappings,
  ...certManagerMappings,
  ...pamMappings
];

// v1 TFeatureSet keys intentionally not compared: live usage counters, plan metadata, and v1 fields
// with no License Server v2 feature (v2 never returns them, so a mapping would be permanently v2_missing).
export const EXCLUDED_FIELDS: ReadonlySet<string> = new Set([
  "_id",
  "slug",
  "tier",
  "status",
  "trial_end",
  "has_used_trial",
  "workspacesUsed",
  "environmentsUsed",
  "workspaceLimit",
  "memberLimit",
  "pkiLegacyTemplates"
]);
