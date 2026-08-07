import { z } from "zod";

import { ms } from "@app/lib/ms";

/**
 * Knex's `t.string(col)` maps to `varchar(255)`, which is what every PKI table uses for its
 * free-form text columns. Validate against the same bound at the API edge so an over-long value
 * fails as a 422 ValidationFailure instead of reaching Postgres and surfacing as a `22001`
 * (string_data_right_truncation) wrapped in a 500.
 */
export const PKI_TEXT_COLUMN_MAX_LENGTH = 255;

export const PKI_ALT_NAMES_COLUMN_MAX_LENGTH = 4096;

const MAX_CERTIFICATE_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/**
 * Free-form description of a PKI resource. Bounded to the `varchar(255)` description column shared
 * by pki_certificate_profiles, pki_certificate_policies, pki_syncs, and
 * pki_discovery_configs.
 */
export const pkiDescriptionSchema = z
  .string()
  .trim()
  .max(PKI_TEXT_COLUMN_MAX_LENGTH, `Description cannot exceed ${PKI_TEXT_COLUMN_MAX_LENGTH} characters`);

export const subjectAttributeSchema = z.string().trim().max(PKI_TEXT_COLUMN_MAX_LENGTH);

export const domainComponentSchema = z
  .string()
  .trim()
  .min(1, "Domain component cannot be empty")
  .max(255)
  .refine((value) => !value.includes(","), { message: "Domain component cannot contain a comma" });

export const domainComponentsSchema = z
  .array(domainComponentSchema)
  .max(50)
  .refine(
    (components) => components.join(",").length <= PKI_TEXT_COLUMN_MAX_LENGTH,
    `Domain components cannot exceed ${PKI_TEXT_COLUMN_MAX_LENGTH} characters in total`
  );

export enum CertificateRequestStatus {
  PENDING_APPROVAL = "pending_approval",
  PENDING = "pending",
  PENDING_VALIDATION = "pending_validation",
  ISSUED = "issued",
  FAILED = "failed",
  REJECTED = "rejected"
}

export enum CertificateIssuanceOperation {
  ISSUE = "issue",
  SIGN = "sign",
  ORDER = "order",
  RENEW = "renew"
}

export enum CertSubjectAlternativeNameType {
  DNS_NAME = "dns_name",
  IP_ADDRESS = "ip_address",
  EMAIL = "email",
  URI = "uri",
  UPN = "upn"
}

export enum TAltNameType {
  EMAIL = "email",
  DNS = "dns",
  IP = "ip",
  URL = "url",
  UPN = "upn"
}

export const CERT_SUBJECT_ALTERNATIVE_NAMES: Record<
  CertSubjectAlternativeNameType,
  { generalNameType: TAltNameType; otherNameOid?: string }
> = {
  [CertSubjectAlternativeNameType.DNS_NAME]: { generalNameType: TAltNameType.DNS },
  [CertSubjectAlternativeNameType.IP_ADDRESS]: { generalNameType: TAltNameType.IP },
  [CertSubjectAlternativeNameType.EMAIL]: { generalNameType: TAltNameType.EMAIL },
  [CertSubjectAlternativeNameType.URI]: { generalNameType: TAltNameType.URL },
  [CertSubjectAlternativeNameType.UPN]: {
    generalNameType: TAltNameType.UPN,
    otherNameOid: "1.3.6.1.4.1.311.20.2.3"
  }
};

export const SUPPORTED_GENERAL_NAME_TYPES: ReadonlySet<string> = new Set<string>(
  Object.values(CERT_SUBJECT_ALTERNATIVE_NAMES).map(({ generalNameType }) => generalNameType)
);

export const GENERAL_NAME_TYPES_WITH_OTHER_NAME: ReadonlySet<string> = new Set<string>(
  Object.values(CERT_SUBJECT_ALTERNATIVE_NAMES)
    .filter(({ otherNameOid }) => otherNameOid)
    .map(({ generalNameType }) => generalNameType)
);

export enum CertKeyUsageType {
  DIGITAL_SIGNATURE = "digital_signature",
  KEY_ENCIPHERMENT = "key_encipherment",
  NON_REPUDIATION = "non_repudiation",
  DATA_ENCIPHERMENT = "data_encipherment",
  KEY_AGREEMENT = "key_agreement",
  KEY_CERT_SIGN = "key_cert_sign",
  CRL_SIGN = "crl_sign",
  ENCIPHER_ONLY = "encipher_only",
  DECIPHER_ONLY = "decipher_only"
}

export enum CertExtendedKeyUsageType {
  CLIENT_AUTH = "client_auth",
  SERVER_AUTH = "server_auth",
  CODE_SIGNING = "code_signing",
  EMAIL_PROTECTION = "email_protection",
  OCSP_SIGNING = "ocsp_signing",
  TIME_STAMPING = "time_stamping",
  ANY_PURPOSE = "any_purpose"
}

export enum CertExtendedKeyUsage {
  CLIENT_AUTH = "clientAuth",
  SERVER_AUTH = "serverAuth",
  CODE_SIGNING = "codeSigning",
  EMAIL_PROTECTION = "emailProtection",
  TIMESTAMPING = "timeStamping",
  OCSP_SIGNING = "ocspSigning",
  ANY_PURPOSE = "anyExtendedKeyUsage"
}

export enum CertIncludeType {
  MANDATORY = "mandatory",
  OPTIONAL = "optional",
  PROHIBIT = "prohibit"
}

export enum CertAttributeRule {
  ALLOW = "allow",
  DENY = "deny"
}

export enum CertSanEffect {
  ALLOW = "allow",
  DENY = "deny",
  REQUIRE = "require"
}

export enum CertPolicyState {
  ALLOWED = "allowed",
  REQUIRED = "required",
  DENIED = "denied"
}

export enum CertDurationUnit {
  DAYS = "days",
  MONTHS = "months",
  YEARS = "years"
}

export enum CertSubjectAttributeType {
  COMMON_NAME = "common_name",
  ORGANIZATION = "organization",
  COUNTRY = "country",
  STATE = "state",
  LOCALITY = "locality",
  ORGANIZATIONAL_UNIT = "organizational_unit",
  DOMAIN_COMPONENT = "domain_component"
}

export const mapKeyUsageToLegacy = (usage: CertKeyUsageType): string => {
  switch (usage) {
    case CertKeyUsageType.DIGITAL_SIGNATURE:
      return "digitalSignature";
    case CertKeyUsageType.KEY_ENCIPHERMENT:
      return "keyEncipherment";
    case CertKeyUsageType.NON_REPUDIATION:
      return "nonRepudiation";
    case CertKeyUsageType.DATA_ENCIPHERMENT:
      return "dataEncipherment";
    case CertKeyUsageType.KEY_AGREEMENT:
      return "keyAgreement";
    case CertKeyUsageType.KEY_CERT_SIGN:
      return "keyCertSign";
    case CertKeyUsageType.CRL_SIGN:
      return "cRLSign";
    case CertKeyUsageType.ENCIPHER_ONLY:
      return "encipherOnly";
    case CertKeyUsageType.DECIPHER_ONLY:
      return "decipherOnly";
    default:
      return usage;
  }
};

const KEY_USAGE_BY_ALIAS = new Map<string, CertKeyUsageType>(
  Object.values(CertKeyUsageType).flatMap((standard) => [
    [mapKeyUsageToLegacy(standard), standard] as const,
    [standard, standard] as const
  ])
);

export const mapLegacyKeyUsageToStandard = (usage: string): CertKeyUsageType => {
  const standard = KEY_USAGE_BY_ALIAS.get(usage);
  if (!standard) {
    throw new Error(`Unknown key usage: ${usage}`);
  }
  return standard;
};

export const CERT_EXTENDED_KEY_USAGES: Record<
  CertExtendedKeyUsageType,
  { oid: string; legacyName: CertExtendedKeyUsage }
> = {
  [CertExtendedKeyUsageType.CLIENT_AUTH]: { oid: "1.3.6.1.5.5.7.3.2", legacyName: CertExtendedKeyUsage.CLIENT_AUTH },
  [CertExtendedKeyUsageType.SERVER_AUTH]: { oid: "1.3.6.1.5.5.7.3.1", legacyName: CertExtendedKeyUsage.SERVER_AUTH },
  [CertExtendedKeyUsageType.CODE_SIGNING]: { oid: "1.3.6.1.5.5.7.3.3", legacyName: CertExtendedKeyUsage.CODE_SIGNING },
  [CertExtendedKeyUsageType.EMAIL_PROTECTION]: {
    oid: "1.3.6.1.5.5.7.3.4",
    legacyName: CertExtendedKeyUsage.EMAIL_PROTECTION
  },
  [CertExtendedKeyUsageType.OCSP_SIGNING]: { oid: "1.3.6.1.5.5.7.3.9", legacyName: CertExtendedKeyUsage.OCSP_SIGNING },
  [CertExtendedKeyUsageType.TIME_STAMPING]: { oid: "1.3.6.1.5.5.7.3.8", legacyName: CertExtendedKeyUsage.TIMESTAMPING },
  [CertExtendedKeyUsageType.ANY_PURPOSE]: { oid: "2.5.29.37.0", legacyName: CertExtendedKeyUsage.ANY_PURPOSE }
};

const EXTENDED_KEY_USAGE_BY_ALIAS = new Map<string, CertExtendedKeyUsageType>(
  Object.entries(CERT_EXTENDED_KEY_USAGES).flatMap(([standard, { legacyName }]) => [
    // accepted in both the legacy camelCase form and the current snake_case form
    [legacyName, standard as CertExtendedKeyUsageType],
    [standard, standard as CertExtendedKeyUsageType]
  ])
);

export const mapExtendedKeyUsageToLegacy = (usage: CertExtendedKeyUsageType): string =>
  CERT_EXTENDED_KEY_USAGES[usage]?.legacyName ?? usage;

export const mapLegacyExtendedKeyUsageToStandard = (usage: string): CertExtendedKeyUsageType => {
  const standard = EXTENDED_KEY_USAGE_BY_ALIAS.get(usage);
  if (!standard) {
    throw new Error(`Unknown extended key usage: ${usage}`);
  }
  return standard;
};

export const normalizeKeyUsagesForResponse = (usages: readonly string[] | null | undefined): string[] =>
  (usages ?? []).map((usage) => KEY_USAGE_BY_ALIAS.get(usage) ?? usage);

export const normalizeExtendedKeyUsagesForResponse = (usages: readonly string[] | null | undefined): string[] =>
  (usages ?? []).map((usage) => EXTENDED_KEY_USAGE_BY_ALIAS.get(usage) ?? usage);

export const withNormalizedUsagesForResponse = <T extends { keyUsages?: unknown; extendedKeyUsages?: unknown }>(
  row: T
): T => ({
  ...row,
  keyUsages: normalizeKeyUsagesForResponse(row.keyUsages as string[] | null | undefined),
  extendedKeyUsages: normalizeExtendedKeyUsagesForResponse(row.extendedKeyUsages as string[] | null | undefined)
});

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1",
  ECDSA_P521 = "EC_secp521r1",
  ML_DSA_44 = "ML-DSA-44",
  ML_DSA_65 = "ML-DSA-65",
  ML_DSA_87 = "ML-DSA-87",
  SLH_DSA_SHA2_128F = "SLH-DSA-SHA2-128f",
  SLH_DSA_SHA2_128S = "SLH-DSA-SHA2-128s",
  SLH_DSA_SHA2_192F = "SLH-DSA-SHA2-192f",
  SLH_DSA_SHA2_192S = "SLH-DSA-SHA2-192s",
  SLH_DSA_SHA2_256F = "SLH-DSA-SHA2-256f",
  SLH_DSA_SHA2_256S = "SLH-DSA-SHA2-256s",
  SLH_DSA_SHAKE_128F = "SLH-DSA-SHAKE-128f",
  SLH_DSA_SHAKE_128S = "SLH-DSA-SHAKE-128s",
  SLH_DSA_SHAKE_192F = "SLH-DSA-SHAKE-192f",
  SLH_DSA_SHAKE_192S = "SLH-DSA-SHAKE-192s",
  SLH_DSA_SHAKE_256F = "SLH-DSA-SHAKE-256f",
  SLH_DSA_SHAKE_256S = "SLH-DSA-SHAKE-256s"
}

export enum CertSignatureAlgorithm {
  RSA_SHA256 = "RSA-SHA256",
  RSA_SHA384 = "RSA-SHA384",
  RSA_SHA512 = "RSA-SHA512",
  ECDSA_SHA256 = "ECDSA-SHA256",
  ECDSA_SHA384 = "ECDSA-SHA384",
  ECDSA_SHA512 = "ECDSA-SHA512",
  ML_DSA_44 = "ML-DSA-44",
  ML_DSA_65 = "ML-DSA-65",
  ML_DSA_87 = "ML-DSA-87",
  SLH_DSA_SHA2_128F = "SLH-DSA-SHA2-128f",
  SLH_DSA_SHA2_128S = "SLH-DSA-SHA2-128s",
  SLH_DSA_SHA2_192F = "SLH-DSA-SHA2-192f",
  SLH_DSA_SHA2_192S = "SLH-DSA-SHA2-192s",
  SLH_DSA_SHA2_256F = "SLH-DSA-SHA2-256f",
  SLH_DSA_SHA2_256S = "SLH-DSA-SHA2-256s",
  SLH_DSA_SHAKE_128F = "SLH-DSA-SHAKE-128f",
  SLH_DSA_SHAKE_128S = "SLH-DSA-SHAKE-128s",
  SLH_DSA_SHAKE_192F = "SLH-DSA-SHAKE-192f",
  SLH_DSA_SHAKE_192S = "SLH-DSA-SHAKE-192s",
  SLH_DSA_SHAKE_256F = "SLH-DSA-SHAKE-256f",
  SLH_DSA_SHAKE_256S = "SLH-DSA-SHAKE-256s"
}

export enum CertificateRenewalErrorType {
  TEMPLATE_VALIDATION_FAILED = "TEMPLATE_VALIDATION_FAILED",
  CA_NOT_FOUND = "CA_NOT_FOUND",
  CA_INACTIVE = "CA_INACTIVE",
  CERTIFICATE_OUTLIVES_CA = "CERTIFICATE_OUTLIVES_CA",
  TTL_TOO_SHORT = "TTL_TOO_SHORT",
  NOT_ELIGIBLE = "NOT_ELIGIBLE",
  VALIDITY_EXCEEDS_MAXIMUM = "VALIDITY_EXCEEDS_MAXIMUM",
  NOT_ALLOWED_BY_TEMPLATE = "NOT_ALLOWED_BY_TEMPLATE",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}

export const CERTIFICATE_RENEWAL_CONFIG = {
  MIN_RENEW_BEFORE_DAYS: 1,
  MAX_RENEW_BEFORE_DAYS: 30,
  QUEUE_BATCH_SIZE: 100,
  DAILY_CRON_SCHEDULE: "0 0 * * *",
  QUEUE_START_DELAY_MS: 5000
} as const;

export const DEFAULT_CRL_VALIDITY_DAYS = 7;

export const ALGORITHM_FAMILIES = {
  ECDSA: {
    signature: ["SHA256-ECDSA", "SHA384-ECDSA", "SHA512-ECDSA"],
    key: ["ECDSA-P256", "ECDSA-P384", "ECDSA-P521"]
  },
  RSA: {
    signature: ["SHA256-RSA", "SHA384-RSA", "SHA512-RSA"],
    key: ["RSA-2048", "RSA-3072", "RSA-4096"]
  }
} as const;

export const SAN_TYPE_OPTIONS = Object.values(CertSubjectAlternativeNameType);
export const KEY_USAGE_OPTIONS = Object.values(CertKeyUsageType);
export const EXTENDED_KEY_USAGE_OPTIONS = Object.values(CertExtendedKeyUsageType);
export const INCLUDE_TYPE_OPTIONS = Object.values(CertIncludeType);
export const DURATION_UNIT_OPTIONS = Object.values(CertDurationUnit);
export const SUBJECT_ATTRIBUTE_TYPE_OPTIONS = Object.values(CertSubjectAttributeType);
export const ATTRIBUTE_RULE_OPTIONS = Object.values(CertAttributeRule);
export const SAN_EFFECT_OPTIONS = Object.values(CertSanEffect);
export const POLICY_STATE_OPTIONS = Object.values(CertPolicyState);
export const KEY_ALGORITHM_OPTIONS = Object.values(CertKeyAlgorithm);
export const SIGNATURE_ALGORITHM_OPTIONS = Object.values(CertSignatureAlgorithm);

export const subjectAlternativeNameSchema = z.object({
  type: z.nativeEnum(CertSubjectAlternativeNameType),
  value: z
    .string()
    .trim()
    .min(1, "SAN value cannot be empty")
    .max(PKI_TEXT_COLUMN_MAX_LENGTH, `SAN value cannot exceed ${PKI_TEXT_COLUMN_MAX_LENGTH} characters`)
});

export const certificateAttributesSchema = z.object({
  commonName: subjectAttributeSchema.nullish(),
  organization: subjectAttributeSchema.nullish(),
  organizationalUnit: subjectAttributeSchema.nullish(),
  country: subjectAttributeSchema.nullish(),
  state: subjectAttributeSchema.nullish(),
  locality: subjectAttributeSchema.nullish(),
  domainComponents: domainComponentsSchema.nullish(),
  keyUsages: z.nativeEnum(CertKeyUsageType).array().max(20).optional(),
  extendedKeyUsages: z.nativeEnum(CertExtendedKeyUsageType).array().max(20).optional(),
  altNames: z
    .array(subjectAlternativeNameSchema)
    .max(100, "Cannot exceed 100 subject alternative names")
    .refine(
      (names) => names.map((san) => san.value).join(",").length <= PKI_ALT_NAMES_COLUMN_MAX_LENGTH,
      `Subject alternative names cannot exceed ${PKI_ALT_NAMES_COLUMN_MAX_LENGTH} characters in total`
    )
    .optional(),
  signatureAlgorithm: z.nativeEnum(CertSignatureAlgorithm).optional(),
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).optional(),
  ttl: z
    .string()
    .trim()
    .max(32)
    .refine((val) => {
      if (!val) return true;
      const parsed = ms(val);
      return parsed > 0 && parsed <= MAX_CERTIFICATE_TTL_MS;
    }, "TTL must be a positive duration that ends within 100 years")
    .optional(),
  basicConstraints: z
    .object({
      isCA: z.boolean(),
      pathLength: z.number().int().min(0).max(255).optional()
    })
    .optional()
});
