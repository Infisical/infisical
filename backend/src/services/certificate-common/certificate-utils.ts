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
    include: "mandatory" | "optional" | "prohibit";
    value?: string[];
  }>
): Record<string, string | undefined> => {
  const subject: Record<string, string> = {};
  const attributeMap: Record<string, string> = {
    common_name: "commonName"
  };

  if (!templateAttributes || templateAttributes.length === 0) {
    throw new Error(
      "Template must define allowed certificate attributes. Cannot issue certificate without template attribute constraints."
    );
  }

  const allowedAttributes = new Set(templateAttributes.map((attr) => attributeMap[attr.type]));

  Object.keys(attributeMap).forEach((templateType) => {
    const requestKey = attributeMap[templateType];
    const value = request[requestKey];

    if (value && !allowedAttributes.has(requestKey)) {
      throw new Error(
        `Certificate attribute '${requestKey}' is not allowed by the template. Template must define constraints for all requested attributes.`
      );
    }
  });

  templateAttributes.forEach((attr) => {
    if (attr.include === "prohibit") {
      return;
    }

    const requestKey = attributeMap[attr.type];
    const value = request[requestKey];

    if (value && typeof value === "string") {
      subject[attr.type] = value;
    }
  });

  return subject;
};

export const buildSubjectAlternativeNamesFromTemplate = (
  request: { subjectAlternativeNames?: Array<{ type: string; value: string }> },
  templateSans?: Array<{
    type: string;
    include: "mandatory" | "optional" | "prohibit";
    value?: string[];
  }>
): string => {
  if (!request.subjectAlternativeNames || request.subjectAlternativeNames.length === 0) {
    return "";
  }

  if (!templateSans || templateSans.length === 0) {
    if (request.subjectAlternativeNames.length > 0) {
      throw new Error(
        "Template must define allowed subject alternative names. Cannot issue certificate with SANs when template has no SAN constraints."
      );
    }
    return "";
  }

  const templateSanTypes = new Set(templateSans.map((san) => san.type));
  const prohibitedTypes = new Set(templateSans.filter((san) => san.include === "prohibit").map((san) => san.type));

  request.subjectAlternativeNames.forEach((san) => {
    const sanType = san.type === "dns_name" ? "dns_name" : san.type;
    if (!templateSanTypes.has(sanType)) {
      throw new Error(
        `Subject Alternative Name type '${sanType}' is not allowed by the template. Template must define constraints for all requested SAN types.`
      );
    }
  });

  const allowedSans: string[] = [];

  request.subjectAlternativeNames.forEach((san) => {
    const sanType = san.type === "dns_name" ? "dns_name" : san.type;
    if (!prohibitedTypes.has(sanType)) {
      allowedSans.push(san.value);
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
