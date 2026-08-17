import { z } from "zod";

/**
 * Knex's `t.string(col)` maps to `varchar(255)`, which is what every PKI table uses for its
 * free-form text columns. Validate against the same bound at the API edge so an over-long value
 * fails as a 422 ValidationFailure instead of reaching Postgres and surfacing as a `22001`
 * (string_data_right_truncation) wrapped in a 500.
 */
export const PKI_TEXT_COLUMN_MAX_LENGTH = 255;

/**
 * Free-form description of a PKI resource. Bounded to the `varchar(255)` description column shared
 * by pki_certificate_profiles, pki_certificate_policies, pki_syncs, and
 * pki_discovery_configs.
 */
export const pkiDescriptionSchema = z
  .string()
  .trim()
  .max(PKI_TEXT_COLUMN_MAX_LENGTH, `Description cannot exceed ${PKI_TEXT_COLUMN_MAX_LENGTH} characters`);

/**
 * A single X.509 subject attribute (CN, O, OU, C, ST, L). Every column these land in —
 * certificate_requests, certificates, internal_certificate_authorities — is `varchar(255)`.
 */
export const subjectAttributeSchema = z.string().trim().max(PKI_TEXT_COLUMN_MAX_LENGTH);

export const domainComponentSchema = z
  .string()
  .trim()
  .min(1, "Domain component cannot be empty")
  .max(255)
  .refine((value) => !value.includes(","), { message: "Domain component cannot contain a comma" });

export const MAX_DOMAIN_COMPONENTS = 50;

/**
 * Domain components are persisted comma-joined into a single `varchar(255)` column
 * (certificate_requests.domainComponents, certificates.subjectDomainComponents), so the combined
 * length is what has to fit — bounding each component individually is not enough.
 */
export const domainComponentsSchema = z
  .array(domainComponentSchema)
  .max(MAX_DOMAIN_COMPONENTS)
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

/**
 * Single source of truth for subject alternative name types.
 *
 * To support a new one: add a member to CertSubjectAlternativeNameType and to TAltNameType
 * (certificate-types.ts), then add one row here.
 *
 * `generalNameType` is the value @peculiar/x509 uses for the GeneralName, both when parsing a CSR
 * and when building the extension. `otherNameOid` is set only for types carried as an otherName
 * rather than a native GeneralName choice.
 */
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

export const mapLegacyKeyUsageToStandard = (usage: string): CertKeyUsageType => {
  switch (usage) {
    case "digitalSignature":
    case "digital_signature":
      return CertKeyUsageType.DIGITAL_SIGNATURE;
    case "keyEncipherment":
    case "key_encipherment":
      return CertKeyUsageType.KEY_ENCIPHERMENT;
    case "nonRepudiation":
    case "non_repudiation":
      return CertKeyUsageType.NON_REPUDIATION;
    case "dataEncipherment":
    case "data_encipherment":
      return CertKeyUsageType.DATA_ENCIPHERMENT;
    case "keyAgreement":
    case "key_agreement":
      return CertKeyUsageType.KEY_AGREEMENT;
    case "keyCertSign":
    case "key_cert_sign":
      return CertKeyUsageType.KEY_CERT_SIGN;
    case "cRLSign":
    case "crl_sign":
      return CertKeyUsageType.CRL_SIGN;
    case "encipherOnly":
    case "encipher_only":
      return CertKeyUsageType.ENCIPHER_ONLY;
    case "decipherOnly":
    case "decipher_only":
      return CertKeyUsageType.DECIPHER_ONLY;
    default:
      throw new Error(`Unknown key usage: ${usage}`);
  }
};

/**
 * Single source of truth for extended key usages.
 *
 * To support a new one: add a member to CertExtendedKeyUsageType and to CertExtendedKeyUsage
 * (certificate-types.ts), then add one row here.
 */
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

/**
 * Certificates we mint just-in-time are verified by gateways, relays, and agents on hosts whose
 * clocks we do not control. A notBefore of "now" makes a fresh certificate look not-yet-valid to a
 * host running behind us, and a notAfter of "issuance + ttl" makes a short-lived one look already
 * expired to a host running ahead of us, so widen the window by this tolerance at both ends.
 *
 * Lives here rather than next to the getNotBefore/getNotAfter helpers in certificate-authority-fns
 * so `@app/lib/ssh` can read it without importing that module and closing an import cycle.
 */
export const CERT_CLOCK_SKEW_MS = 5 * 60 * 1000;

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
