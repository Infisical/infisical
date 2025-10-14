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

export enum CertDurationUnit {
  DAYS = "days",
  MONTHS = "months",
  YEARS = "years"
}

export enum CertSubjectAttributeType {
  COMMON_NAME = "common_name"
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
      return "Common Name";
    default:
      return type;
  }
};

export const formatIncludeType = (include: CertIncludeType): string => {
  switch (include) {
    case CertIncludeType.MANDATORY:
      return "Mandatory";
    case CertIncludeType.OPTIONAL:
      return "Optional";
    case CertIncludeType.PROHIBIT:
      return "Prohibit";
    default:
      return include;
  }
};

export const mapLegacySANTypeToStandard = (type: string): CertSubjectAlternativeNameType => {
  switch (type) {
    case "dns":
    case "dns_name":
      return CertSubjectAlternativeNameType.DNS_NAME;
    case "ip":
    case "ip_address":
      return CertSubjectAlternativeNameType.IP_ADDRESS;
    case "email":
      return CertSubjectAlternativeNameType.EMAIL;
    case "uri":
    case "url":
      return CertSubjectAlternativeNameType.URI;
    default:
      throw new Error(`Unknown SAN type: ${type}`);
  }
};

export const mapSANTypeToLegacy = (type: CertSubjectAlternativeNameType): string => {
  switch (type) {
    case CertSubjectAlternativeNameType.DNS_NAME:
      return "dns";
    case CertSubjectAlternativeNameType.IP_ADDRESS:
      return "ip";
    case CertSubjectAlternativeNameType.EMAIL:
      return "email";
    case CertSubjectAlternativeNameType.URI:
      return "uri";
    default:
      return type;
  }
};

export const SAN_TYPE_OPTIONS = Object.values(CertSubjectAlternativeNameType);
export const KEY_USAGE_OPTIONS = Object.values(CertKeyUsageType);
export const EXTENDED_KEY_USAGE_OPTIONS = Object.values(CertExtendedKeyUsageType);
export const INCLUDE_TYPE_OPTIONS = Object.values(CertIncludeType);
export const DURATION_UNIT_OPTIONS = Object.values(CertDurationUnit);
export const SUBJECT_ATTRIBUTE_TYPE_OPTIONS = Object.values(CertSubjectAttributeType);