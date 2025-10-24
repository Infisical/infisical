import RE2 from "re2";

import { CertExtendedKeyUsage, CertKeyUsage } from "../certificate/certificate-types";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  mapExtendedKeyUsageToLegacy,
  mapKeyUsageToLegacy,
  mapLegacyExtendedKeyUsageToStandard,
  mapLegacyKeyUsageToStandard
} from "./certificate-constants";

interface CertificateRequestInput {
  keyUsages?: string[];
  extendedKeyUsages?: string[];
}

export const mapEnumsForValidation = <T extends CertificateRequestInput>(request: T): T => {
  const mapKeyUsage = (usage: string): string => {
    try {
      return mapLegacyKeyUsageToStandard(usage);
    } catch {
      return usage;
    }
  };

  const mapExtendedKeyUsage = (usage: string): string => {
    try {
      return mapLegacyExtendedKeyUsageToStandard(usage);
    } catch {
      return usage;
    }
  };

  return {
    ...request,
    keyUsages: request.keyUsages?.map(mapKeyUsage),
    extendedKeyUsages: request.extendedKeyUsages?.map(mapExtendedKeyUsage)
  } as T;
};

export const normalizeDateForApi = (date: Date | string | undefined): string | undefined => {
  if (!date) return undefined;
  return date instanceof Date ? date.toISOString() : date;
};

export const bufferToString = (data: Buffer | string): string => {
  return String(data);
};

export const buildCertificateSubjectFromTemplate = (
  request: Record<string, unknown>,
  templateAttributes?: Array<{
    type: string;
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>
): Record<string, string | undefined> => {
  const subject: Record<string, string> = {};
  const attributeMap: Record<string, string> = {
    common_name: "commonName",
    organization: "organization",
    country: "country"
  };

  if (!templateAttributes || templateAttributes.length === 0) {
    return subject;
  }

  templateAttributes.forEach((attr) => {
    const requestKey = attributeMap[attr.type];
    const value = request[requestKey];

    if (value && typeof value === "string" && (attr.allowed || attr.required)) {
      subject[attr.type] = value;
    }
  });

  return subject;
};

const isWildcardPattern = (value: string): boolean => {
  return value.includes("*");
};

const createWildcardRegex = (pattern: string): RE2 => {
  const escapeRegex = new RE2(/[.+?^${}()|[\]\\]/g);
  const escaped = pattern.replace(escapeRegex, "\\$&");
  const wildcardRegex = new RE2(/\*/g);
  const regexPattern = escaped.replace(wildcardRegex, ".*");
  return new RE2(`^${regexPattern}$`);
};

const validateValueAgainstPatterns = (value: string, patterns: string[]): boolean => {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  for (const pattern of patterns) {
    if (isWildcardPattern(pattern)) {
      try {
        const regex = createWildcardRegex(pattern);
        if (regex.test(value)) {
          return true;
        }
      } catch {
        if (pattern === value) {
          return true;
        }
      }
    } else if (pattern === value) {
      return true;
    }
  }

  return false;
};

export const buildSubjectAlternativeNamesFromTemplate = (
  request: { subjectAlternativeNames?: Array<{ type: string; value: string }> },
  templateSans?: Array<{
    type: string;
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>
): string => {
  if (!request.subjectAlternativeNames || request.subjectAlternativeNames.length === 0) {
    return "";
  }

  if (!templateSans || templateSans.length === 0) {
    return request.subjectAlternativeNames.map((san) => san.value).join(",");
  }

  const allowedSans: string[] = [];

  request.subjectAlternativeNames.forEach((san) => {
    const templateSan = templateSans.find((template) => template.type === san.type);

    if (!templateSan) {
      allowedSans.push(san.value);
      return;
    }

    if (templateSan.denied && validateValueAgainstPatterns(san.value, templateSan.denied)) {
      throw new Error(`SAN value '${san.value}' is explicitly denied for type '${san.type}'`);
    }

    const isRequired = templateSan.required && validateValueAgainstPatterns(san.value, templateSan.required);
    const isAllowed = templateSan.allowed && validateValueAgainstPatterns(san.value, templateSan.allowed);

    if (isRequired || isAllowed || (!templateSan.allowed && !templateSan.required)) {
      allowedSans.push(san.value);
    } else {
      throw new Error(`SAN value '${san.value}' is not allowed for type '${san.type}'`);
    }
  });

  return allowedSans.join(",");
};

export const convertLegacyKeyUsage = (usage: CertKeyUsage): CertKeyUsageType => {
  return mapLegacyKeyUsageToStandard(usage);
};

export const convertToLegacyKeyUsage = (usage: CertKeyUsageType): CertKeyUsage => {
  return mapKeyUsageToLegacy(usage) as CertKeyUsage;
};

export const convertLegacyExtendedKeyUsage = (usage: CertExtendedKeyUsage): CertExtendedKeyUsageType => {
  return mapLegacyExtendedKeyUsageToStandard(usage);
};

export const convertToLegacyExtendedKeyUsage = (usage: CertExtendedKeyUsageType): CertExtendedKeyUsage => {
  return mapExtendedKeyUsageToLegacy(usage) as CertExtendedKeyUsage;
};

export const convertKeyUsageArrayFromLegacy = (usages?: CertKeyUsage[]): CertKeyUsageType[] | undefined => {
  return usages?.map(convertLegacyKeyUsage);
};

export const convertKeyUsageArrayToLegacy = (usages?: CertKeyUsageType[]): CertKeyUsage[] | undefined => {
  return usages?.map(convertToLegacyKeyUsage);
};

export const convertExtendedKeyUsageArrayFromLegacy = (
  usages?: CertExtendedKeyUsage[]
): CertExtendedKeyUsageType[] | undefined => {
  return usages?.map(convertLegacyExtendedKeyUsage);
};

export const convertExtendedKeyUsageArrayToLegacy = (
  usages?: CertExtendedKeyUsageType[]
): CertExtendedKeyUsage[] | undefined => {
  return usages?.map(convertToLegacyExtendedKeyUsage);
};
