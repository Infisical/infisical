import { z } from "zod";

export enum TableName {
  Users = "users",
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
  ApiKey = "api_keys",
  Project = "projects",
  ProjectBot = "project_bots",
  Environment = "project_environments",
  ProjectMembership = "project_memberships",
  ProjectRoles = "project_roles",
  ProjectKeys = "project_keys",
  Secret = "secrets",
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
  IdentityUniversalAuth = "identity_universal_auths",
  IdentityUaClientSecret = "identity_ua_client_secrets",
  IdentityOrgMembership = "identity_org_memberships",
  IdentityProjectMembership = "identity_project_memberships",
  SecretApprovalPolicy = "secret_approval_policies",
  SecretApprovalPolicyApprover = "secret_approval_policies_approvers",
  SecretApprovalRequest = "secret_approval_requests",
  SecretApprovalRequestReviewer = "secret_approval_requests_reviewers",
  SecretApprovalRequestSecret = "secret_approval_requests_secrets",
  SecretApprovalRequestSecretTag = "secret_approval_request_secret_tags",
  SecretRotation = "secret_rotations",
  SecretRotationOutput = "secret_rotation_outputs",
  SamlConfig = "saml_configs",
  AuditLog = "audit_logs",
  GitAppInstallSession = "git_app_install_sessions",
  GitAppOrg = "git_app_org",
  SecretScanningGitRisk = "secret_scanning_git_risks",
  TrustedIps = "trusted_ips",
  // junction tables with tags
  JnSecretTag = "secret_tag_junction",
  SecretVersionTag = "secret_version_tag_junction"
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
  V1 = "v1",
  V2 = "v2"
}

export enum IdentityAuthMethod {
  Univeral = "universal-auth"
}
