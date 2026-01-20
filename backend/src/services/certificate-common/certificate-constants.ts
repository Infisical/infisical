export enum CertificateRequestStatus {
  PENDING_APPROVAL = "pending_approval",
  PENDING = "pending",
  ISSUED = "issued",
  FAILED = "failed",
  REJECTED = "rejected"
}

export enum CertificateIssuanceType {
  ISSUE = "issue",
  CSR = "csr",
  ORDER = "order"
}

export enum CertSubjectAlternativeNameType {
  DNS_NAME = "dns_name",
  IP_ADDRESS = "ip_address",
  EMAIL = "email",
  URI = "uri"
}

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
  TIME_STAMPING = "time_stamping"
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
  ORGANIZATIONAL_UNIT = "organizational_unit"
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

export const mapExtendedKeyUsageToLegacy = (usage: CertExtendedKeyUsageType): string => {
  switch (usage) {
    case CertExtendedKeyUsageType.CLIENT_AUTH:
      return "clientAuth";
    case CertExtendedKeyUsageType.SERVER_AUTH:
      return "serverAuth";
    case CertExtendedKeyUsageType.CODE_SIGNING:
      return "codeSigning";
    case CertExtendedKeyUsageType.EMAIL_PROTECTION:
      return "emailProtection";
    case CertExtendedKeyUsageType.OCSP_SIGNING:
      return "ocspSigning";
    case CertExtendedKeyUsageType.TIME_STAMPING:
      return "timeStamping";
    default:
      return usage;
  }
};

export const mapLegacyExtendedKeyUsageToStandard = (usage: string): CertExtendedKeyUsageType => {
  switch (usage) {
    case "clientAuth":
    case "client_auth":
      return CertExtendedKeyUsageType.CLIENT_AUTH;
    case "serverAuth":
    case "server_auth":
      return CertExtendedKeyUsageType.SERVER_AUTH;
    case "codeSigning":
    case "code_signing":
      return CertExtendedKeyUsageType.CODE_SIGNING;
    case "emailProtection":
    case "email_protection":
      return CertExtendedKeyUsageType.EMAIL_PROTECTION;
    case "ocspSigning":
    case "ocsp_signing":
      return CertExtendedKeyUsageType.OCSP_SIGNING;
    case "timeStamping":
    case "time_stamping":
      return CertExtendedKeyUsageType.TIME_STAMPING;
    default:
      throw new Error(`Unknown extended key usage: ${usage}`);
  }
};

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1"
}

export enum CertSignatureAlgorithm {
  RSA_SHA256 = "RSA-SHA256",
  RSA_SHA384 = "RSA-SHA384",
  RSA_SHA512 = "RSA-SHA512",
  ECDSA_SHA256 = "ECDSA-SHA256",
  ECDSA_SHA384 = "ECDSA-SHA384",
  ECDSA_SHA512 = "ECDSA-SHA512"
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
