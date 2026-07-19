import { TFeatureMapping } from "../dual-read-types";

export const pkiSecurityMappings: TFeatureMapping[] = [
  {
    v2Key: "ca_crl",
    v1Field: "caCrl",
    extractV1: (p) => p.caCrl
  },
  {
    v2Key: "pki_est",
    v1Field: "pkiEst",
    extractV1: (p) => p.pkiEst
  },
  {
    v2Key: "acme_client",
    v1Field: "pkiAcme",
    extractV1: (p) => p.pkiAcme
  },
  {
    v2Key: "pki_scep",
    v1Field: "pkiScep",
    extractV1: (p) => p.pkiScep
  },
  {
    v2Key: "pki_pqc",
    v1Field: "pkiPqc",
    extractV1: (p) => p.pkiPqc
  },
  {
    v2Key: "pki_code_signing",
    v1Field: "pkiCodeSigning",
    extractV1: (p) => p.pkiCodeSigning
  },
  {
    v2Key: "ssh_host_groups",
    v1Field: "sshHostGroups",
    extractV1: (p) => p.sshHostGroups
  },
  {
    v2Key: "hsm",
    v1Field: "hsm",
    extractV1: (p) => p.hsm
  },
  {
    v2Key: "external_kms",
    v1Field: "externalKms",
    extractV1: (p) => p.externalKms
  },
  {
    v2Key: "kms_pqc",
    v1Field: "kmsPqc",
    extractV1: (p) => p.kmsPqc
  },
  {
    v2Key: "kmip",
    v1Field: "kmip",
    extractV1: (p) => p.kmip
  },
  {
    v2Key: "fips",
    v1Field: "fips",
    extractV1: (p) => p.fips
  },
  {
    v2Key: "gateway",
    v1Field: "gateway",
    extractV1: (p) => p.gateway
  },
  {
    v2Key: "gateway_pool",
    v1Field: "gatewayPool",
    extractV1: (p) => p.gatewayPool
  },
  {
    v2Key: "honey_tokens",
    v1Field: "honeyTokens",
    extractV1: (p) => p.honeyTokens
  },
  {
    v2Key: "secrets_brokering",
    v1Field: "secretsBrokering",
    extractV1: (p) => p.secretsBrokering
  },
  {
    v2Key: "custom_rate_limits",
    v1Field: "customRateLimits",
    extractV1: (p) => p.customRateLimits
  },
  {
    v2Key: "custom_alerts",
    v1Field: "customAlerts",
    extractV1: (p) => p.customAlerts
  }
];
