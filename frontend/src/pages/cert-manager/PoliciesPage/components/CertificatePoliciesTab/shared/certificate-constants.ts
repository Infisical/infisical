export enum CertSubjectAlternativeNameType {
  DNS_NAME = "dns_name",
  IP_ADDRESS = "ip_address",
  EMAIL = "email",
  URI = "uri",
  UPN = "upn"
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
  SMART_CARD_LOGON = "smart_card_logon",
  TIME_STAMPING = "time_stamping",
  ANY_PURPOSE = "any_purpose"
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
  HOURS = "hours",
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
  LOCALITY = "locality",
  DOMAIN_COMPONENT = "domain_component"
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
    case CertSubjectAlternativeNameType.UPN:
      return "UPN";
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

export const EXTENDED_KEY_USAGE_LABELS: Record<CertExtendedKeyUsageType, string> = {
  [CertExtendedKeyUsageType.CLIENT_AUTH]: "Client Auth",
  [CertExtendedKeyUsageType.SERVER_AUTH]: "Server Auth",
  [CertExtendedKeyUsageType.CODE_SIGNING]: "Code Signing",
  [CertExtendedKeyUsageType.EMAIL_PROTECTION]: "Email Protection",
  [CertExtendedKeyUsageType.OCSP_SIGNING]: "OCSP Signing",
  [CertExtendedKeyUsageType.SMART_CARD_LOGON]: "Smart Card Logon",
  [CertExtendedKeyUsageType.TIME_STAMPING]: "Time Stamping",
  [CertExtendedKeyUsageType.ANY_PURPOSE]: "Any Extended Key Usage"
};

export const formatExtendedKeyUsage = (usage: CertExtendedKeyUsageType): string =>
  EXTENDED_KEY_USAGE_LABELS[usage] ?? usage;

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
    case CertSubjectAttributeType.DOMAIN_COMPONENT:
      return "Domain Component (DC)";
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
  REQUIRED = "required",
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
  ECDSA_P384 = "EC_secp384r1",
  ML_DSA_44 = "ML-DSA-44",
  ML_DSA_65 = "ML-DSA-65",
  ML_DSA_87 = "ML-DSA-87"
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
  ML_DSA_87 = "ML-DSA-87"
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
    case CertSignatureAlgorithm.ML_DSA_44:
      return "ML-DSA-44";
    case CertSignatureAlgorithm.ML_DSA_65:
      return "ML-DSA-65";
    case CertSignatureAlgorithm.ML_DSA_87:
      return "ML-DSA-87";
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
    case CertKeyAlgorithm.ML_DSA_44:
      return "ML-DSA-44";
    case CertKeyAlgorithm.ML_DSA_65:
      return "ML-DSA-65";
    case CertKeyAlgorithm.ML_DSA_87:
      return "ML-DSA-87";
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
    "SHA512-ECDSA": "ECDSA-SHA512",
    "ML-DSA-44": "ML-DSA-44",
    "ML-DSA-65": "ML-DSA-65",
    "ML-DSA-87": "ML-DSA-87"
  };
  return mapping[policyFormat] || policyFormat;
};

export const mapPolicyKeyAlgorithmToApi = (policyFormat: string): string => {
  const mapping: Record<string, string> = {
    "RSA-2048": "RSA_2048",
    "RSA-3072": "RSA_3072",
    "RSA-4096": "RSA_4096",
    "ECDSA-P256": "EC_prime256v1",
    "ECDSA-P384": "EC_secp384r1",
    "ECDSA-P521": "EC_secp521r1",
    "ML-DSA-44": "ML-DSA-44",
    "ML-DSA-65": "ML-DSA-65",
    "ML-DSA-87": "ML-DSA-87"
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
  },
  ML_DSA: {
    signature: ["ML-DSA-44", "ML-DSA-65", "ML-DSA-87"] as const,
    key: ["ML-DSA-44", "ML-DSA-65", "ML-DSA-87"] as const
  }
} as const;

export enum CertExtensionRuleKind {
  ALLOW = "allow",
  REQUIRE = "require",
  DENY = "deny"
}

export enum CertExtensionCriticality {
  CRITICAL = "critical",
  NOT_CRITICAL = "not_critical"
}

const MAX_CUSTOM_EXTENSION_VALUE_BYTES = 2048;
const OID_PATTERN_SOURCE = "[0-2](\\.(0|[1-9][0-9]{0,14})){1,20}";
const SID_PATTERN = /^S-1-[0-9]{1,10}(-[0-9]{1,10}){1,14}$/;
const TEMPLATE_INFORMATION_PATTERN = new RegExp(
  `^(${OID_PATTERN_SOURCE}):(0|[1-9][0-9]{0,4})(\\.(0|[1-9][0-9]{0,4}))?$`
);

export const CUSTOM_EXTENSION_PRESETS: Record<
  string,
  { label: string; placeholder: string; validate: (value: string) => string | null }
> = {
  "1.3.6.1.4.1.311.25.2": {
    label: "AD SID security extension",
    placeholder: "S-1-5-21-...",
    validate: (value) =>
      SID_PATTERN.test(value)
        ? null
        : "Enter a security identifier, for example S-1-5-21-1004336348-1177238915-682003330-1103"
  },
  "1.3.6.1.4.1.311.20.2": {
    label: "Certificate template name",
    placeholder: "Machine",
    validate: (value) => {
      if (value.length > 64) return "Template name cannot exceed 64 characters";
      return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 0xffff)
        ? "Template name cannot contain characters outside the basic multilingual plane"
        : null;
    }
  },
  "1.3.6.1.4.1.311.21.7": {
    label: "Certificate template information",
    placeholder: "1.3.6.1.4.1.311.21.8.1.2:100.3",
    validate: (value) =>
      TEMPLATE_INFORMATION_PATTERN.test(value)
        ? null
        : "Enter the template OID, a colon, then the version, for example 1.3.6.1.4.1.311.21.8.1.2:100.3"
  }
};

const getCustomExtensionPreset = (oid: string) =>
  Object.prototype.hasOwnProperty.call(CUSTOM_EXTENSION_PRESETS, oid)
    ? CUSTOM_EXTENSION_PRESETS[oid]
    : undefined;

export const isPresetExtensionOid = (oid: string) => Boolean(getCustomExtensionPreset(oid));

export const customExtensionLabelFor = (oid: string, label?: string | null) =>
  label?.trim() || getCustomExtensionPreset(oid)?.label || oid;

export const validateCustomExtensionValue = (oid: string, value: string): string | null => {
  const preset = getCustomExtensionPreset(oid);
  if (preset) return preset.validate(value);
  return new TextEncoder().encode(value).length > MAX_CUSTOM_EXTENSION_VALUE_BYTES
    ? `Value cannot exceed ${MAX_CUSTOM_EXTENSION_VALUE_BYTES} bytes`
    : null;
};

export const getCustomExtensionValuePlaceholder = (oid: string) =>
  getCustomExtensionPreset(oid)?.placeholder ?? "Value";
