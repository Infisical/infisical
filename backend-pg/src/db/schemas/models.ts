export enum TableName {
  Users = "users",
  UserEncryptionKey = "user_encryption_keys",
  AuthTokens = "auth_tokens",
  AuthTokenSession = "auth_token_sessions",
  BackupPrivateKey = "backup_private_key"
}

export type TImmutableDBKeys = "id" | "createdAt" | "updatedAt";

export enum SecretEncryptionAlgo {
  AES_256_GCM = "aes-256-gcm"
}

export enum SecretKeyEncoding {
  UTF8 = "utf8",
  BASE64 = "base64",
  HEX = "hex"
}
