// Browser-side mirror of the backend's `backend/src/lib/ip/index.ts`, which relies
// on Node's `net.isIPv4` / `net.isIPv6`. The IPv4/IPv6 regexes below are copied
// verbatim from Node's internal `lib/internal/net.js`, so this validator accepts and
// rejects exactly what the backend's `isValidIpOrCidr` does — keeping client-side form
// validation in lockstep with the server.

const v4Seg = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])";
const v4Str = `(?:${v4Seg}[.]){3}${v4Seg}`;
const IPv4Reg = new RegExp(`^${v4Str}$`);

const v6Seg = "(?:[0-9a-fA-F]{1,4})";
const IPv6Reg = new RegExp(
  "^(?:" +
    `(?:${v6Seg}:){7}(?:${v6Seg}|:)|` +
    `(?:${v6Seg}:){6}(?:${v4Str}|:${v6Seg}|:)|` +
    `(?:${v6Seg}:){5}(?::${v4Str}|(?::${v6Seg}){1,2}|:)|` +
    `(?:${v6Seg}:){4}(?:(?::${v6Seg}){0,1}:${v4Str}|(?::${v6Seg}){1,3}|:)|` +
    `(?:${v6Seg}:){3}(?:(?::${v6Seg}){0,2}:${v4Str}|(?::${v6Seg}){1,4}|:)|` +
    `(?:${v6Seg}:){2}(?:(?::${v6Seg}){0,3}:${v4Str}|(?::${v6Seg}){1,5}|:)|` +
    `(?:${v6Seg}:){1}(?:(?::${v6Seg}){0,4}:${v4Str}|(?::${v6Seg}){1,6}|:)|` +
    `(?::(?:(?::${v6Seg}){0,5}:${v4Str}|(?::${v6Seg}){1,7}|:))` +
    ")(?:%[0-9a-zA-Z]{1,})?$"
);

export const isIPv4 = (ip: string): boolean => IPv4Reg.test(ip);

export const isIPv6 = (ip: string): boolean => IPv6Reg.test(ip);

/**
 * Checks if a given string is a valid IPv4/IPv6 address in CIDR notation.
 * The prefix length must be 0-32 for IPv4 and 0-128 for IPv6.
 */
export const isValidCidr = (cidr: string): boolean => {
  const [ip, prefix] = cidr.split("/");

  const prefixNum = parseInt(prefix, 10);

  // ensure prefix exists and is a number within the appropriate range for each IP version
  if (
    !prefix ||
    Number.isNaN(prefixNum) ||
    (isIPv4(ip) && (prefixNum < 0 || prefixNum > 32)) ||
    (isIPv6(ip) && (prefixNum < 0 || prefixNum > 128))
  ) {
    return false;
  }

  // ensure the IP portion of the CIDR block is a valid IPv4 or IPv6 address
  if (!isIPv4(ip) && !isIPv6(ip)) {
    return false;
  }

  return true;
};

/**
 * Checks if a given string is a valid IPv4/IPv6 address or a valid CIDR block.
 * Mirrors the backend's `isValidIpOrCidr`.
 */
export const isValidIpOrCidr = (ip: string): boolean => {
  // if the string contains a slash, treat it as a CIDR block
  if (ip.includes("/")) {
    return isValidCidr(ip);
  }

  // otherwise, treat it as a standalone IP address (either IPv4 or IPv6)
  return isIPv4(ip) || isIPv6(ip);
};
