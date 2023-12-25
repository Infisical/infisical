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
  SecretImport = "secret_imports",
  SecretTag = "secret_tags",
  Integration = "integrations",
  IntegrationAuth = "integration_auths",
  JnSecretTag = "secret_tag_junction",
  JnSecretVersionTag = "secret_version_tag_junction"
}

export type TImmutableDBKeys = "id" | "createdAt" | "updatedAt";

export const UserDeviceSchema = z
  .object({
    ip: z.string(),
    userAgent: z.string()
  })
  .array()
  .default([]);

export enum OrgMembershipRole {
  Admin = "admin",
  Member = "member",
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
