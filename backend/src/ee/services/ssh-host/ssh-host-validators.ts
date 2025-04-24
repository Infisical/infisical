import { isFQDN } from "@app/lib/validator/validate-url";

export const isValidHostname = (value: string): boolean => {
  if (typeof value !== "string") return false;
  if (value.length > 255) return false;

  // Only allow strict FQDNs, no wildcards or IPs
  return isFQDN(value, {
    require_tld: true,
    allow_underscores: false,
    allow_trailing_dot: false,
    allow_numeric_tld: true,
    allow_wildcard: false
  });
};
