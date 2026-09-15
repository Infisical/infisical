export const UPGRADE_FEATURES = {
  audit_logs: {
    name: "Audit Logs",
    description: "Review organization activity and investigate security-relevant events."
  },
  audit_log_streams: {
    name: "Audit Log Streams",
    description: "Send audit events to your security and observability systems."
  },
  cert_manager: {
    name: "Certificate Manager",
    description: "Issue, manage, and automate certificates from one place."
  },
  dynamic_secret: {
    name: "Dynamic Secrets",
    description: "Issue short-lived credentials that are revoked automatically."
  },
  environment_limit: {
    name: "Additional Environments",
    description: "Create more environments to separate and manage application configurations."
  },
  enforce_google_sso: {
    name: "Google SSO Enforcement",
    description: "Require organization members to sign in with an approved Google account."
  },
  enforce_mfa: {
    name: "MFA Enforcement",
    description: "Require multi-factor authentication across your organization."
  },
  enterprise_app_connections: {
    name: "Enterprise App Connections",
    description: "Connect Infisical to infrastructure available on Enterprise plans."
  },
  enterprise_certificate_syncs: {
    name: "Enterprise Certificate Syncs",
    description: "Deliver certificates to the services that need them."
  },
  enterprise_secret_syncs: {
    name: "Enterprise Secret Syncs",
    description: "Keep secrets synchronized with external platforms."
  },
  external_kms: {
    name: "External KMS",
    description: "Protect organization data with a key from your external KMS."
  },
  gateway_pool: {
    name: "Gateway Pools",
    description: "Run highly available gateways for private infrastructure access."
  },
  github_org_sync: {
    name: "GitHub Organization Sync",
    description: "Keep organization membership synchronized with GitHub."
  },
  groups: {
    name: "Groups",
    description: "Manage access for teams instead of assigning every member individually."
  },
  hsm: {
    name: "HSM Connectors",
    description: "Use hardware-backed keys for certificate signing operations."
  },
  honey_tokens: {
    name: "Honey Tokens",
    description: "Detect suspicious access with decoy secrets."
  },
  ip_allowlisting: {
    name: "IP Allowlisting",
    description: "Restrict access to approved network locations."
  },
  kmip: {
    name: "KMIP",
    description: "Manage encryption keys through the KMIP protocol."
  },
  ldap: {
    name: "LDAP Authentication",
    description: "Connect your directory to authenticate and manage organization members."
  },
  max_identity_limit: {
    name: "Additional Members and Identities",
    description: "Add more organization members and machine identities."
  },
  machine_identity_auth_templates: {
    name: "Machine Identity Auth Templates",
    description: "Standardize authentication settings for machine identities."
  },
  oidc_sso: {
    name: "OIDC SSO",
    description: "Connect your identity provider with OpenID Connect."
  },
  pam: {
    name: "Privileged Access Management",
    description: "Control, monitor, and audit access to privileged infrastructure."
  },
  pit_recovery: {
    name: "Point-in-Time Recovery",
    description: "Review and restore earlier versions of your secrets."
  },
  pki_acme: {
    name: "ACME Enrollment",
    description: "Automate certificate issuance and renewal with ACME."
  },
  pki_est: {
    name: "EST Enrollment",
    description: "Automate certificate enrollment and renewal with EST."
  },
  project_templates: {
    name: "Project Templates",
    description: "Standardize project configuration across your organization."
  },
  rbac: {
    name: "Custom Roles",
    description: "Define precise permissions for your organization and projects."
  },
  saml_sso: {
    name: "SAML SSO",
    description: "Connect your identity provider for centralized single sign-on."
  },
  scim: {
    name: "SCIM Provisioning",
    description: "Provision and deprovision organization members from your identity provider."
  },
  secret_access_insights: {
    name: "Secret Access Insights",
    description: "See when and where secrets are accessed."
  },
  secret_approval: {
    name: "Secret Change Approvals",
    description: "Require review before sensitive secret changes are applied."
  },
  secret_rotation: {
    name: "Secret Rotation",
    description: "Rotate credentials automatically on a defined schedule."
  },
  secret_scanning: {
    name: "Secret Scanning",
    description: "Find exposed secrets across connected source-code platforms."
  },
  secrets_brokering: {
    name: "Secrets Brokering",
    description: "Broker time-bound access to infrastructure without exposing credentials."
  },
  ssh_host_groups: {
    name: "SSH Host Groups",
    description: "Organize SSH hosts and manage access at scale."
  },
  sub_organization: {
    name: "Sub-Organizations",
    description: "Delegate administration across isolated organizational units."
  }
} as const;

export type UpgradeFeatureKey = keyof typeof UPGRADE_FEATURES;

export const UPGRADE_FEATURE_PRODUCT_MAP = {
  audit_logs: "secrets_management",
  audit_log_streams: "secrets_management",
  cert_manager: "certificate_management",
  dynamic_secret: "secrets_management",
  environment_limit: "secrets_management",
  enforce_google_sso: "secrets_management",
  enforce_mfa: "secrets_management",
  enterprise_app_connections: "secrets_management",
  enterprise_certificate_syncs: "certificate_management",
  enterprise_secret_syncs: "secrets_management",
  external_kms: "secrets_management",
  gateway_pool: "privileged_access_management",
  github_org_sync: "secrets_management",
  groups: "secrets_management",
  hsm: "certificate_management",
  honey_tokens: "secrets_management",
  ip_allowlisting: "secrets_management",
  kmip: "secrets_management",
  ldap: "secrets_management",
  max_identity_limit: "secrets_management",
  machine_identity_auth_templates: "secrets_management",
  oidc_sso: "secrets_management",
  pam: "privileged_access_management",
  pit_recovery: "secrets_management",
  pki_acme: "certificate_management",
  pki_est: "certificate_management",
  project_templates: "secrets_management",
  rbac: "secrets_management",
  saml_sso: "secrets_management",
  scim: "secrets_management",
  secret_access_insights: "secrets_management",
  secret_approval: "secrets_management",
  secret_rotation: "secrets_management",
  secret_scanning: "secrets_management",
  secrets_brokering: "privileged_access_management",
  ssh_host_groups: "privileged_access_management",
  sub_organization: "secrets_management"
} as const satisfies Record<UpgradeFeatureKey, string>;

export const getUpgradeFeature = (featureKey?: UpgradeFeatureKey) =>
  featureKey ? UPGRADE_FEATURES[featureKey] : undefined;
