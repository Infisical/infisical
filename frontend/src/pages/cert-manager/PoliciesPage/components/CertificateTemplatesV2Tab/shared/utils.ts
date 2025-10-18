import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  formatExtendedKeyUsage,
  formatKeyUsage,
  USAGE_STATES,
  UsageState
} from "./certificate-constants";

export const formatUsageName = (usage: string): string => {
  if (Object.values(CertKeyUsageType).includes(usage as CertKeyUsageType)) {
    return formatKeyUsage(usage as CertKeyUsageType);
  }
  if (Object.values(CertExtendedKeyUsageType).includes(usage as CertExtendedKeyUsageType)) {
    return formatExtendedKeyUsage(usage as CertExtendedKeyUsageType);
  }
  return usage.replace(/_/g, " ");
};

export const getUsageState = (
  usage: CertKeyUsageType | CertExtendedKeyUsageType,
  requiredUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[],
  optionalUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[]
): UsageState => {
  if (requiredUsages.includes(usage)) return USAGE_STATES.REQUIRED;
  if (optionalUsages.includes(usage)) return USAGE_STATES.OPTIONAL;
  return undefined;
};

export const toggleUsageState = (
  usage: CertKeyUsageType | CertExtendedKeyUsageType,
  newState: UsageState,
  currentRequiredUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[],
  currentOptionalUsages: (CertKeyUsageType | CertExtendedKeyUsageType)[],
  toggleRequired: (usage: CertKeyUsageType | CertExtendedKeyUsageType) => void,
  toggleOptional: (usage: CertKeyUsageType | CertExtendedKeyUsageType) => void
) => {
  const isRequired = currentRequiredUsages.includes(usage);
  const isOptional = currentOptionalUsages.includes(usage);

  if (newState === USAGE_STATES.REQUIRED) {
    if (isOptional) toggleOptional(usage);
    if (!isRequired) toggleRequired(usage);
  } else if (newState === USAGE_STATES.OPTIONAL) {
    if (isRequired) toggleRequired(usage);
    if (!isOptional) toggleOptional(usage);
  } else {
    if (isRequired) toggleRequired(usage);
    if (isOptional) toggleOptional(usage);
  }
};
