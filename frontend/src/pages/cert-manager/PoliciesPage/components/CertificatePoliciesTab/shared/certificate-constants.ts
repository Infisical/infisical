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

export enum CertAttributeRule {
  ALLOW = "allow",
  DENY = "deny",
  REQUIRE = "require"
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
  ORGANIZATIONAL_UNIT = "organizational_unit",
  COUNTRY = "country",
  STATE = "state",
  LOCALITY = "locality"
}

export const formatSANType = (type: CertSubjectAlternativeNameType): string => {
  switch (type) {
    case CertSubjectAlternativeNameType.DNS_NAME:
      return "DNS Name";
    case CertSubjectAlternativeNameType.IP_ADDRESS:
      return "IP Address";
    case CertSubjectAlternativeNameType.EMAIL:
      return "Email";
    case CertSubjectAlternativeNameType.URI:
      return "URI";
    default:
      return type;
  }
};

export const formatKeyUsage = (usage: CertKeyUsageType): string => {
  switch (usage) {
    case CertKeyUsageType.DIGITAL_SIGNATURE:
      return "Digital Signature";
    case CertKeyUsageType.KEY_ENCIPHERMENT:
      return "Key Encipherment";
    case CertKeyUsageType.NON_REPUDIATION:
      return "Non Repudiation";
    case CertKeyUsageType.DATA_ENCIPHERMENT:
      return "Data Encipherment";
    case CertKeyUsageType.KEY_AGREEMENT:
      return "Key Agreement";
    case CertKeyUsageType.KEY_CERT_SIGN:
      return "Key Cert Sign";
    case CertKeyUsageType.CRL_SIGN:
      return "CRL Sign";
    case CertKeyUsageType.ENCIPHER_ONLY:
      return "Encipher Only";
    case CertKeyUsageType.DECIPHER_ONLY:
      return "Decipher Only";
    default:
      return usage;
  }
};

export const formatExtendedKeyUsage = (usage: CertExtendedKeyUsageType): string => {
  switch (usage) {
    case CertExtendedKeyUsageType.CLIENT_AUTH:
      return "Client Auth";
    case CertExtendedKeyUsageType.SERVER_AUTH:
      return "Server Auth";
    case CertExtendedKeyUsageType.CODE_SIGNING:
      return "Code Signing";
    case CertExtendedKeyUsageType.EMAIL_PROTECTION:
      return "Email Protection";
    case CertExtendedKeyUsageType.OCSP_SIGNING:
      return "OCSP Signing";
    case CertExtendedKeyUsageType.TIME_STAMPING:
      return "Time Stamping";
    default:
      return usage;
  }
};

export const formatSubjectAttributeType = (type: CertSubjectAttributeType): string => {
  switch (type) {
    case CertSubjectAttributeType.COMMON_NAME:
      return "Common Name (CN)";
    case CertSubjectAttributeType.ORGANIZATION:
      return "Organization (O)";
    case CertSubjectAttributeType.ORGANIZATIONAL_UNIT:
      return "Organizational Unit (OU)";
    case CertSubjectAttributeType.COUNTRY:
      return "Country (C)";
    case CertSubjectAttributeType.STATE:
      return "State/Province (ST)";
    case CertSubjectAttributeType.LOCALITY:
      return "Locality (L)";
    default:
      return type;
  }
};

export const formatAttributeRule = (rule: CertAttributeRule): string => {
  switch (rule) {
    case CertAttributeRule.ALLOW:
      return "Allow";
    case CertAttributeRule.DENY:
      return "Deny";
    case CertAttributeRule.REQUIRE:
      return "Require";
    default:
      return rule;
  }
};

export const formatSanEffect = (effect: CertSanEffect): string => {
  switch (effect) {
    case CertSanEffect.ALLOW:
      return "Allow";
    case CertSanEffect.DENY:
      return "Deny";
    case CertSanEffect.REQUIRE:
      return "Require";
    default:
      return effect;
  }
};

export const SAN_TYPE_OPTIONS = Object.values(CertSubjectAlternativeNameType);
export const KEY_USAGE_OPTIONS = Object.values(CertKeyUsageType);
export const EXTENDED_KEY_USAGE_OPTIONS = Object.values(CertExtendedKeyUsageType);
export const DURATION_UNIT_OPTIONS = Object.values(CertDurationUnit);
export const SUBJECT_ATTRIBUTE_TYPE_OPTIONS = Object.values(CertSubjectAttributeType);
export const ATTRIBUTE_RULE_OPTIONS = Object.values(CertAttributeRule);
export const SAN_EFFECT_OPTIONS = Object.values(CertSanEffect);
export const POLICY_STATE_OPTIONS = Object.values(CertPolicyState);

export enum CertSubjectAttributeInclude {
  OPTIONAL = "optional",
  PROHIBIT = "prohibit"
}

export enum CertSanInclude {
  MANDATORY = "mandatory",
  OPTIONAL = "optional",
  PROHIBIT = "prohibit"
}

export const SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS = Object.values(CertSubjectAttributeInclude);
export const SAN_INCLUDE_OPTIONS = Object.values(CertSanInclude);

export const USAGE_STATES = {
  REQUIRED: "required",
  OPTIONAL: "optional"
} as const;

export type UsageState = (typeof USAGE_STATES)[keyof typeof USAGE_STATES] | undefined;

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

export const SIGNATURE_ALGORITHM_OPTIONS = Object.values(CertSignatureAlgorithm);
export const KEY_ALGORITHM_OPTIONS = Object.values(CertKeyAlgorithm);

export const getSignatureAlgorithmDisplayName = (algorithm: CertSignatureAlgorithm): string => {
  switch (algorithm) {
    case CertSignatureAlgorithm.RSA_SHA256:
      return "RSA with SHA-256";
    case CertSignatureAlgorithm.RSA_SHA384:
      return "RSA with SHA-384";
    case CertSignatureAlgorithm.RSA_SHA512:
      return "RSA with SHA-512";
    case CertSignatureAlgorithm.ECDSA_SHA256:
      return "ECDSA with SHA-256";
    case CertSignatureAlgorithm.ECDSA_SHA384:
      return "ECDSA with SHA-384";
    case CertSignatureAlgorithm.ECDSA_SHA512:
      return "ECDSA with SHA-512";
    default:
      return algorithm;
  }
};

export const getKeyAlgorithmDisplayName = (algorithm: CertKeyAlgorithm): string => {
  switch (algorithm) {
    case CertKeyAlgorithm.RSA_2048:
      return "RSA 2048";
    case CertKeyAlgorithm.RSA_3072:
      return "RSA 3072";
    case CertKeyAlgorithm.RSA_4096:
      return "RSA 4096";
    case CertKeyAlgorithm.ECDSA_P256:
      return "ECDSA P-256";
    case CertKeyAlgorithm.ECDSA_P384:
      return "ECDSA P-384";
    default:
      return algorithm;
  }
};

export const mapPolicySignatureAlgorithmToApi = (policyFormat: string): string => {
  const mapping: Record<string, string> = {
    "SHA256-RSA": "RSA-SHA256",
    "SHA384-RSA": "RSA-SHA384",
    "SHA512-RSA": "RSA-SHA512",
    "SHA256-ECDSA": "ECDSA-SHA256",
    "SHA384-ECDSA": "ECDSA-SHA384",
    "SHA512-ECDSA": "ECDSA-SHA512"
  };
  return mapping[policyFormat] || policyFormat;
};

export const mapPolicyKeyAlgorithmToApi = (policyFormat: string): string => {
  const mapping: Record<string, string> = {
    "RSA-2048": "RSA_2048",
    "RSA-3072": "RSA_3072",
    "RSA-4096": "RSA_4096",
    "ECDSA-P256": "EC_prime256v1",
    "ECDSA-P384": "EC_secp384r1"
  };
  return mapping[policyFormat] || policyFormat;
};

export const POLICY_PRESET_IDS = {
  CUSTOM: "custom",
  TLS_SERVER: "tls-server",
  TLS_CLIENT: "tls-client",
  CODE_SIGNING: "code-signing",
  DEVICE: "device",
  USER: "user",
  EMAIL_PROTECTION: "email-protection",
  DUAL_PURPOSE_SERVER: "dual-purpose-server",
  INTERMEDIATE_CA: "intermediate-ca"
} as const;

export type PolicyPresetId = (typeof POLICY_PRESET_IDS)[keyof typeof POLICY_PRESET_IDS];

export const ALGORITHM_FAMILIES = {
  ECDSA: {
    signature: ["SHA256-ECDSA", "SHA384-ECDSA", "SHA512-ECDSA"] as const,
    key: ["ECDSA-P256", "ECDSA-P384", "ECDSA-P521"] as const
  },
  RSA: {
    signature: ["SHA256-RSA", "SHA384-RSA", "SHA512-RSA"] as const,
    key: ["RSA-2048", "RSA-3072", "RSA-4096"] as const
  }
} as const;
