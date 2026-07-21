import { TFeatureMapping, unlimitedWhenNull } from "../dual-read-types";

export const limitsMappings: TFeatureMapping[] = [
  {
    v2Key: "environment_limit",
    v1Field: "environmentLimit",
    extractV1: (p) => p.environmentLimit,
    normalize: unlimitedWhenNull
  },
  {
    // Max identities allowed. Dedicated cap feature, separate from the `identities` usage meter.
    v2Key: "max_identity_limit",
    v1Field: "identityLimit",
    extractV1: (p) => p.identityLimit,
    normalize: unlimitedWhenNull
  },
  {
    // Max internal CAs allowed. Dedicated cap feature, separate from the `internal_cas` usage meter.
    v2Key: "max_internal_cas",
    v1Field: "maxInternalCas",
    extractV1: (p) => p.maxInternalCas,
    normalize: unlimitedWhenNull
  },
  {
    // Max PAM accounts allowed. null (v1 default) means uncapped, so it normalizes to UNLIMITED.
    v2Key: "max_pam_accounts",
    v1Field: "maxPamAccounts",
    extractV1: (p) => p.maxPamAccounts,
    normalize: unlimitedWhenNull
  },
  {
    // null (v1 default) means uncapped, so it normalizes to UNLIMITED for the dual-read compare.
    v2Key: "secret_sync_limit",
    v1Field: "secretSyncLimit",
    extractV1: (p) => p.secretSyncLimit,
    normalize: unlimitedWhenNull
  },
  {
    v2Key: "audit_log_stream_limit",
    v1Field: "auditLogStreamLimit",
    extractV1: (p) => p.auditLogStreamLimit
  },
  {
    v2Key: "honey_token_limit",
    v1Field: "honeyTokenLimit",
    extractV1: (p) => p.honeyTokenLimit
  },
  {
    v2Key: "read_rate_limit",
    v1Field: "rateLimits.readLimit",
    extractV1: (p) => p.rateLimits?.readLimit ?? null
  },
  {
    v2Key: "write_rate_limit",
    v1Field: "rateLimits.writeLimit",
    extractV1: (p) => p.rateLimits?.writeLimit ?? null
  },
  {
    v2Key: "secrets_rate_limit",
    v1Field: "rateLimits.secretsLimit",
    extractV1: (p) => p.rateLimits?.secretsLimit ?? null
  }
];
