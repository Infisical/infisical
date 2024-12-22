import { z } from "zod";

export enum TableName {
  Users = "users",
  SshCertificateAuthority = "ssh_certificate_authorities",
  SshCertificateAuthoritySecret = "ssh_certificate_authority_secrets",
  SshCertificateTemplate = "ssh_certificate_templates",
  SshCertificate = "ssh_certificates",
  SshCertificateBody = "ssh_certificate_bodies",
  CertificateAuthority = "certificate_authorities",
  CertificateTemplateEstConfig = "certificate_template_est_configs",
  CertificateAuthorityCert = "certificate_authority_certs",
  CertificateAuthoritySecret = "certificate_authority_secret",
  CertificateAuthorityCrl = "certificate_authority_crl",
  Certificate = "certificates",
  CertificateBody = "certificate_bodies",
  CertificateSecret = "certificate_secrets",
  CertificateTemplate = "certificate_templates",
  PkiAlert = "pki_alerts",
  PkiCollection = "pki_collections",
  PkiCollectionItem = "pki_collection_items",
  Groups = "groups",
  GroupProjectMembership = "group_project_memberships",
  GroupProjectMembershipRole = "group_project_membership_roles",
  ExternalGroupOrgRoleMapping = "external_group_org_role_mappings",
  UserGroupMembership = "user_group_membership",
  UserAliases = "user_aliases",
  UserEncryptionKey = "user_encryption_keys",
  AuthTokens = "auth_tokens",
  AuthTokenSession = "auth_token_sessions",
  BackupPrivateKey = "backup_private_key",
  Organization = "organizations",
  OrgMembership = "org_memberships",
  OrgRoles = "org_roles",
  OrgBot = "org_bots",
  IncidentContact = "incident_contacts",
  UserAction = "user_actions",
  SuperAdmin = "super_admin",
  RateLimit = "rate_limit",
  ApiKey = "api_keys",
  Project = "projects",
  ProjectBot = "project_bots",
  Environment = "project_environments",
  ProjectMembership = "project_memberships",
  ProjectRoles = "project_roles",
  ProjectUserAdditionalPrivilege = "project_user_additional_privilege",
  ProjectUserMembershipRole = "project_user_membership_roles",
  ProjectKeys = "project_keys",
  ProjectTemplates = "project_templates",
  Secret = "secrets",
  SecretReference = "secret_references",
  SecretSharing = "secret_sharing",
  UserSecrets = "user_secrets",
  SecretBlindIndex = "secret_blind_indexes",
  SecretVersion = "secret_versions",
  SecretFolder = "secret_folders",
  SecretFolderVersion = "secret_folder_versions",
  SecretImport = "secret_imports",
  Snapshot = "secret_snapshots",
  SnapshotSecret = "secret_snapshot_secrets",
  SnapshotFolder = "secret_snapshot_folders",
  SecretTag = "secret_tags",
  Integration = "integrations",
  IntegrationAuth = "integration_auths",
  ServiceToken = "service_tokens",
  Webhook = "webhooks",
  Identity = "identities",
  IdentityAccessToken = "identity_access_tokens",
  IdentityTokenAuth = "identity_token_auths",
  IdentityUniversalAuth = "identity_universal_auths",
  IdentityKubernetesAuth = "identity_kubernetes_auths",
  IdentityGcpAuth = "identity_gcp_auths",
  IdentityAzureAuth = "identity_azure_auths",
  IdentityUaClientSecret = "identity_ua_client_secrets",
  IdentityAwsAuth = "identity_aws_auths",
  IdentityOidcAuth = "identity_oidc_auths",
  IdentityJwtAuth = "identity_jwt_auths",
  IdentityOrgMembership = "identity_org_memberships",
  IdentityProjectMembership = "identity_project_memberships",
  IdentityProjectMembershipRole = "identity_project_membership_role",
  IdentityProjectAdditionalPrivilege = "identity_project_additional_privilege",
  // used by both identity and users
  IdentityMetadata = "identity_metadata",
  ScimToken = "scim_tokens",
  AccessApprovalPolicy = "access_approval_policies",
  AccessApprovalPolicyApprover = "access_approval_policies_approvers",
  AccessApprovalRequest = "access_approval_requests",
  AccessApprovalRequestReviewer = "access_approval_requests_reviewers",
  SecretApprovalPolicy = "secret_approval_policies",
  SecretApprovalPolicyApprover = "secret_approval_policies_approvers",
  SecretApprovalRequest = "secret_approval_requests",
  SecretApprovalRequestReviewer = "secret_approval_requests_reviewers",
  SecretApprovalRequestSecret = "secret_approval_requests_secrets",
  SecretApprovalRequestSecretTag = "secret_approval_request_secret_tags",
  SecretRotation = "secret_rotations",
  SecretRotationOutput = "secret_rotation_outputs",
  SamlConfig = "saml_configs",
  LdapConfig = "ldap_configs",
  OidcConfig = "oidc_configs",
  LdapGroupMap = "ldap_group_maps",
  AuditLog = "audit_logs",
  AuditLogStream = "audit_log_streams",
  GitAppInstallSession = "git_app_install_sessions",
  GitAppOrg = "git_app_org",
  SecretScanningGitRisk = "secret_scanning_git_risks",
  TrustedIps = "trusted_ips",
  DynamicSecret = "dynamic_secrets",
  DynamicSecretLease = "dynamic_secret_leases",
  SecretV2 = "secrets_v2",
  SecretReferenceV2 = "secret_references_v2",
  SecretVersionV2 = "secret_versions_v2",
  SecretApprovalRequestSecretV2 = "secret_approval_requests_secrets_v2",
  SecretApprovalRequestSecretTagV2 = "secret_approval_request_secret_tags_v2",
  SnapshotSecretV2 = "secret_snapshot_secrets_v2",
  ProjectSplitBackfillIds = "project_split_backfill_ids",
  // junction tables with tags
  SecretV2JnTag = "secret_v2_tag_junction",
  JnSecretTag = "secret_tag_junction",
  SecretVersionTag = "secret_version_tag_junction",
  SecretVersionV2Tag = "secret_version_v2_tag_junction",
  SecretRotationOutputV2 = "secret_rotation_output_v2",
  // KMS Service
  KmsServerRootConfig = "kms_root_config",
  KmsKey = "kms_keys",
  ExternalKms = "external_kms",
  InternalKms = "internal_kms",
  InternalKmsKeyVersion = "internal_kms_key_version",
  TotpConfig = "totp_configs",
  // @depreciated
  KmsKeyVersion = "kms_key_versions",
  WorkflowIntegrations = "workflow_integrations",
  SlackIntegrations = "slack_integrations",
  ProjectSlackConfigs = "project_slack_configs",
  AppConnection = "app_connections"
}

export type TImmutableDBKeys = "id" | "createdAt" | "updatedAt";

export const UserDeviceSchema = z
  .object({
    ip: z.string(),
    userAgent: z.string()
  })
  .array()
  .default([]);

export const ServiceTokenScopes = z
  .object({
    environment: z.string(),
    secretPath: z.string().default("/")
  })
  .array();

export enum OrgMembershipRole {
  Admin = "admin",
  Member = "member",
  NoAccess = "no-access",
  Custom = "custom"
}

export enum OrgMembershipStatus {
  Invited = "invited",
  Accepted = "accepted"
}

export enum ProjectMembershipRole {
  Admin = "admin",
  Member = "member",
  Custom = "custom",
  Viewer = "viewer",
  NoAccess = "no-access"
}

export enum SecretEncryptionAlgo {
  AES_256_GCM = "aes-256-gcm"
}

export enum SecretKeyEncoding {
  UTF8 = "utf8",
  BASE64 = "base64",
  HEX = "hex"
}

export enum SecretType {
  Shared = "shared",
  Personal = "personal"
}

export enum ProjectVersion {
  V1 = 1,
  V2 = 2,
  V3 = 3
}

export enum ProjectUpgradeStatus {
  InProgress = "IN_PROGRESS",
  // Completed -> Will be null if completed. So a completed status is not needed
  Failed = "FAILED"
}

export enum IdentityAuthMethod {
  TOKEN_AUTH = "token-auth",
  UNIVERSAL_AUTH = "universal-auth",
  KUBERNETES_AUTH = "kubernetes-auth",
  GCP_AUTH = "gcp-auth",
  AWS_AUTH = "aws-auth",
  AZURE_AUTH = "azure-auth",
  OIDC_AUTH = "oidc-auth",
  JWT_AUTH = "jwt-auth"
}

export enum ProjectType {
  SecretManager = "secret-manager",
  CertificateManager = "cert-manager",
  KMS = "kms",
  SSH = "ssh"
}
