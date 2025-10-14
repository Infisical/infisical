import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  formatExtendedKeyUsage,
  formatKeyUsage
} from "./certificate-constants";

export const formatUsageName = (usage: string): string => {
  try {
    if (Object.values(CertKeyUsageType).includes(usage as CertKeyUsageType)) {
      return formatKeyUsage(usage as CertKeyUsageType);
    }
    if (Object.values(CertExtendedKeyUsageType).includes(usage as CertExtendedKeyUsageType)) {
      return formatExtendedKeyUsage(usage as CertExtendedKeyUsageType);
    }
  } catch {
  }
  return usage.replace(/_/g, " ");
};

export const getUsageState = (
  usage: CertKeyUsageType | CertExtendedKeyUsageType,
  requiredUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[],
  optionalUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[]
): "required" | "optional" | undefined => {
  if (requiredUsages.includes(usage)) return "required";
  if (optionalUsages.includes(usage)) return "optional";
  return undefined;
};

export const toggleUsageState = (
  usage: CertKeyUsageType | CertExtendedKeyUsageType,
  newState: "required" | "optional" | undefined,
  currentRequiredUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[],
  currentOptionalUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[],
  toggleRequired: (usage: CertKeyUsageType | CertExtendedKeyUsageType) => void,
  toggleOptional: (usage: CertKeyUsageType | CertExtendedKeyUsageType) => void
) => {
  const isRequired = currentRequiredUsages.includes(usage);
  const isOptional = currentOptionalUsages.includes(usage);

  if (newState === "required") {
    if (isOptional) toggleOptional(usage);
    if (!isRequired) toggleRequired(usage);
  } else if (newState === "optional") {
    if (isRequired) toggleRequired(usage);
    if (!isOptional) toggleOptional(usage);
  } else {
    if (isRequired) toggleRequired(usage);
    if (isOptional) toggleOptional(usage);
  }
};
