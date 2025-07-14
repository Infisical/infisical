export const BillingPlanRows = {
  IdentityLimit: { name: "Organization identity limit", field: "identityLimit" },
  WorkspaceLimit: { name: "Project limit", field: "workspaceLimit" },
  EnvironmentLimit: { name: "Environment limit", field: "environmentLimit" },
  SecretVersioning: { name: "Secret versioning", field: "secretVersioning" },
  PitRecovery: { name: "Point in time recovery", field: "pitRecovery" },
  Rbac: { name: "RBAC", field: "rbac" },
  CustomRateLimits: { name: "Custom rate limits", field: "customRateLimits" },
  CustomAlerts: { name: "Custom alerts", field: "customAlerts" },
  AuditLogs: { name: "Audit logs", field: "auditLogs" },
  SamlSSO: { name: "SAML SSO", field: "samlSSO" },
  SshHostGroups: { name: "SSH Host Groups", field: "sshHostGroups" },
  Hsm: { name: "Hardware Security Module (HSM)", field: "hsm" },
  OidcSSO: { name: "OIDC SSO", field: "oidcSSO" },
  SecretApproval: { name: "Secret approvals", field: "secretApproval" },
  SecretRotation: { name: "Secret rotation", field: "secretRotation" },
  InstanceUserManagement: { name: "Instance User Management", field: "instanceUserManagement" },
  ExternalKms: { name: "External KMS", field: "externalKms" }
} as const;

export const BillingPlanTableHead = {
  Allowed: { name: "Allowed" },
  Used: { name: "Used" }
} as const;
