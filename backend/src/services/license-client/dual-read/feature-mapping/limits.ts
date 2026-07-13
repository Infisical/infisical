import { TFeatureMapping, unlimitedWhenNull } from "../dual-read-types";

export const limitsMappings: TFeatureMapping[] = [
  {
    v2Key: "environment_limit",
    v1Field: "environmentLimit",
    extractV1: (p) => p.environmentLimit,
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
