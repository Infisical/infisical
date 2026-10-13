export type CapabilityUpgradeIntent = {
  scope: "platform" | "instance" | "product";
  featureKey:
    | "groups"
    | "rbac"
    | "instance_user_management"
    | "hsm"
    | "workspace_limit"
    | "sub_organization"
    | "external_kms"
    | "kmip"
    | "audit_logs"
    | "audit_log_retention_days"
    | "audit_log_streams"
    | "gateway_pool"
    | "project_templates"
    | "enterprise_app_connections"
    | "enforce_mfa"
    | "github_org_sync"
    | "scim"
    | "ldap"
    | "saml_sso"
    | "oidc_sso"
    | "sso_enforcement"
    | "machine_identity_auth_templates"
    | "identity_auth"
    | "agent_vault_byo_s3";
  productName?: string;
  title: string;
  description: string;
  isEnterpriseFeature: boolean;
};

export const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

export const getCapabilityUpgradeUrl = (
  intent: CapabilityUpgradeIntent,
  organization: { id: string; rootOrgId?: string | null }
) =>
  intent.scope === "instance"
    ? CONTACT_SALES_URL
    : `/organizations/${organization.rootOrgId ?? organization.id}/billing`;

export const GroupsUpgradeIntent = {
  scope: "platform",
  featureKey: "groups",
  title: "Unlock Groups",
  description: "Manage access for teams by organizing members into groups.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const CustomRolesUpgradeIntent = {
  scope: "platform",
  featureKey: "rbac",
  title: "Unlock Custom Roles",
  description: "Control access with custom roles and granular permissions.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const InstanceUserManagementUpgradeIntent = {
  scope: "instance",
  featureKey: "instance_user_management",
  title: "Unlock Instance User Management",
  description: "Manage server administrators and user access across your Infisical instance.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const InstanceHsmUpgradeIntent = {
  scope: "instance",
  featureKey: "hsm",
  title: "Unlock Hardware Security Modules",
  description: "Protect your instance's encryption keys with a Hardware Security Module (HSM).",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const ProjectLimitUpgradeIntent = {
  scope: "platform",
  featureKey: "workspace_limit",
  title: "Unlock More Projects",
  description: "Compare subscriptions to increase your organization's project allowance.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const SubOrganizationsUpgradeIntent = {
  scope: "platform",
  featureKey: "sub_organization",
  title: "Unlock Sub-Organizations",
  description: "Separate teams under one organization with shared billing.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const ExternalKmsUpgradeIntent = {
  scope: "platform",
  featureKey: "external_kms",
  title: "Unlock External KMS",
  description: "Use your own key management system to encrypt organization and project data.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const HsmConnectorsUpgradeIntent = {
  scope: "platform",
  featureKey: "hsm",
  title: "Unlock HSM Connectors",
  description: "Connect Hardware Security Modules for protected cryptographic operations.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const KmipUpgradeIntent = {
  scope: "platform",
  featureKey: "kmip",
  title: "Unlock KMIP",
  description: "Manage cryptographic keys through KMIP-compatible clients.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const AuditLogsUpgradeIntent = {
  scope: "platform",
  featureKey: "audit_logs",
  title: "Unlock Audit Logs",
  description: "Review activity across your organization's products.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const AuditRetentionUpgradeIntent = {
  scope: "platform",
  featureKey: "audit_log_retention_days",
  title: "Unlock Audit Log Retention",
  description: "Keep organization activity history available for longer.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const AuditLogStreamsUpgradeIntent = {
  scope: "platform",
  featureKey: "audit_log_streams",
  title: "Unlock Audit Log Streaming",
  description: "Send audit activity to external monitoring systems.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const GatewayPoolsUpgradeIntent = {
  scope: "platform",
  featureKey: "gateway_pool",
  title: "Unlock Gateway Pools",
  description: "Connect private infrastructure through shared gateway pools.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const ProjectTemplatesUpgradeIntent = {
  scope: "platform",
  featureKey: "project_templates",
  title: "Unlock Project Templates",
  description: "Reuse project configuration across your organization.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const EnterpriseAppConnectionsUpgradeIntent = {
  scope: "platform",
  featureKey: "enterprise_app_connections",
  title: "Unlock Enterprise App Connections",
  description: "Connect enterprise providers across your organization's products.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const MfaEnforcementUpgradeIntent = {
  scope: "platform",
  featureKey: "enforce_mfa",
  title: "Unlock MFA Enforcement",
  description: "Require multi-factor authentication for organization members.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const GithubSyncUpgradeIntent = {
  scope: "platform",
  featureKey: "github_org_sync",
  title: "Unlock GitHub Organization Sync",
  description: "Sync organization membership from GitHub.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const ScimUpgradeIntent = {
  scope: "platform",
  featureKey: "scim",
  title: "Unlock SCIM Provisioning",
  description: "Provision and deprovision users from your identity provider.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const LdapUpgradeIntent = {
  scope: "platform",
  featureKey: "ldap",
  title: "Unlock LDAP Authentication",
  description: "Connect your directory for centralized identity management.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const SamlSsoUpgradeIntent = {
  scope: "platform",
  featureKey: "saml_sso",
  title: "Unlock SAML SSO",
  description: "Connect a SAML identity provider for organization sign-in.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const OidcSsoUpgradeIntent = {
  scope: "platform",
  featureKey: "oidc_sso",
  title: "Unlock OIDC SSO",
  description: "Connect an OIDC identity provider for organization sign-in.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const SsoEnforcementUpgradeIntent = {
  scope: "platform",
  featureKey: "sso_enforcement",
  title: "Unlock SSO Enforcement",
  description: "Configure required sign-in methods for your organization.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const MachineIdentityTemplatesUpgradeIntent = {
  scope: "platform",
  featureKey: "machine_identity_auth_templates",
  title: "Unlock Machine Identity Auth Templates",
  description: "Reuse authentication configuration across machine identities.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;

export const IdentityAuthUpgradeIntent = {
  scope: "platform",
  featureKey: "identity_auth",
  title: "Unlock Machine Identity Authentication",
  description: "Review subscription options for this machine identity authentication method.",
  isEnterpriseFeature: false
} satisfies CapabilityUpgradeIntent;

export const AgentVaultSessionLogsUpgradeIntent = {
  scope: "product",
  productName: "Agent Vault",
  featureKey: "agent_vault_byo_s3",
  title: "Unlock Agent Vault Session Logs",
  description: "Record agent requests in your own storage for review and investigation.",
  isEnterpriseFeature: true
} satisfies CapabilityUpgradeIntent;
