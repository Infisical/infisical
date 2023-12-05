import { z } from "zod";

export enum TableName {
  Users = "users",
  UserEncryptionKey = "user_encryption_keys",
  AuthTokens = "auth_tokens",
  AuthTokenSession = "auth_token_sessions",
  BackupPrivateKey = "backup_private_key",
  Organization = "organizations",
  OrgMembership = "organization_memberships"
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

export enum SecretEncryptionAlgo {
  AES_256_GCM = "aes-256-gcm"
}

export enum SecretKeyEncoding {
  UTF8 = "utf8",
  BASE64 = "base64",
  HEX = "hex"
}
