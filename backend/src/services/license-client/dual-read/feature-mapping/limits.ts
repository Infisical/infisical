import { TFeatureMapping, unlimitedWhenNull } from "../dual-read-types";

export const limitsMappings: TFeatureMapping[] = [
  {
    v2Key: "workspace_limit",
    v1Field: "workspaceLimit",
    extractV1: (p) => p.workspaceLimit,
    normalize: unlimitedWhenNull
  },
  {
    v2Key: "member_limit",
    v1Field: "memberLimit",
    extractV1: (p) => p.memberLimit,
    normalize: unlimitedWhenNull
  },
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
    v2Key: "rate_limits_read_limit",
    v1Field: "rateLimits.readLimit",
    extractV1: (p) => p.rateLimits.readLimit
  },
  {
    v2Key: "rate_limits_write_limit",
    v1Field: "rateLimits.writeLimit",
    extractV1: (p) => p.rateLimits.writeLimit
  },
  {
    v2Key: "rate_limits_secrets_limit",
    v1Field: "rateLimits.secretsLimit",
    extractV1: (p) => p.rateLimits.secretsLimit
  }
];
