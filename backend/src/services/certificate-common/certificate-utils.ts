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
    allowedSans.push(san.value);
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
