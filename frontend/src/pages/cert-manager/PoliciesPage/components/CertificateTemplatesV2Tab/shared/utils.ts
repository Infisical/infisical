export const KEY_USAGES = [
  "digital_signature",
  "key_encipherment",
  "non_repudiation",
  "data_encipherment",
  "key_agreement",
  "key_cert_sign",
  "crl_sign",
  "encipher_only",
  "decipher_only"
] as const;

export const EXTENDED_KEY_USAGES = [
  "client_auth",
  "server_auth",
  "code_signing",
  "email_protection",
  "ocsp_signing",
  "time_stamping"
] as const;

export const SUBJECT_ATTRIBUTE_TYPES = [
  "common_name",
  "organization_name",
  "organization_unit",
  "locality",
  "state",
  "country",
  "email",
  "street_address",
  "postal_code"
] as const;

export const SAN_TYPES = ["dns_name", "ip_address", "email", "uri"] as const;

export const INCLUDE_OPTIONS = ["mandatory", "optional", "prohibit"] as const;

export const formatUsageName = (usage: string): string => {
  return usage.replace(/_/g, " ");
};
export const getUsageState = (
  usage: string,
  requiredUsages: string[],
  optionalUsages: string[]
): "required" | "optional" | undefined => {
  if (requiredUsages.includes(usage)) return "required";
  if (optionalUsages.includes(usage)) return "optional";
  return undefined;
};

export const toggleUsageState = (
  usage: string,
  newState: "required" | "optional" | undefined,
  currentRequiredUsages: string[],
  currentOptionalUsages: string[],
  toggleRequired: (usage: string) => void,
  toggleOptional: (usage: string) => void
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
