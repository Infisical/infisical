import net from "node:net";

import { ForbiddenRequestError } from "../errors";

export enum IPType {
  IPV4 = "ipv4",
  IPV6 = "ipv6"
}

/**
 * Return details of IP [ip]:
 * - If [ip] is a specific IP address then return the IPv4/IPv6 address
 * - If [ip] is a subnet then return the network IPv4/IPv6 address and prefix
 */
export const extractIPDetails = (ip: string) => {
  if (net.isIPv4(ip))
    return {
      ipAddress: ip,
      type: IPType.IPV4
    };

  if (net.isIPv6(ip))
    return {
      ipAddress: ip,
      type: IPType.IPV6
    };

  const [ipNet, prefix] = ip.split("/");

  let type;
  switch (net.isIP(ipNet)) {
    case 4:
      type = IPType.IPV4;
      break;
    case 6:
      type = IPType.IPV6;
      break;
    default:
      throw new Error("Failed to extract IP details");
  }

  return {
    ipAddress: ipNet,
    type,
    prefix: parseInt(prefix, 10)
  };
};

/**
 * Checks if a given string is a valid CIDR block.
 *
 * The function checks if the input string is a valid IPv4 or IPv6 address in CIDR notation.
 *
 * CIDR notation includes a network address followed by a slash ('/') and a prefix length.
 * For IPv4, the prefix length must be between 0 and 32. For IPv6, it must be between 0 and 128.
 * If the input string is not a valid CIDR block, the function returns `false`.
 *
 */
export const isValidCidr = (cidr: string): boolean => {
  const [ip, prefix] = cidr.split("/");

  const prefixNum = parseInt(prefix, 10);

  // ensure prefix exists and is a number within the appropriate range for each IP version
  if (
    !prefix ||
    Number.isNaN(prefixNum) ||
    (net.isIPv4(ip) && (prefixNum < 0 || prefixNum > 32)) ||
    (net.isIPv6(ip) && (prefixNum < 0 || prefixNum > 128))
  ) {
    return false;
  }

  // ensure the IP portion of the CIDR block is a valid IPv4 or IPv6 address
  if (!net.isIPv4(ip) && !net.isIPv6(ip)) {
    return false;
  }

  return true;
};

/**
 * Checks if a given string is a valid IPv4/IPv6 address or a valid CIDR block.
 *
 * If the string contains a slash ('/'), it treats the input as a CIDR block and checks its validity.
 * Otherwise, it treats the string as a standalone IP address (either IPv4 or IPv6) and checks its validity.
 *
 * @param {string} input - The string to be checked. It could be an IP address or a CIDR block.
 * @returns {boolean} Returns `true` if the string is a valid IP address (either IPv4 or IPv6) or a valid CIDR block, `false` otherwise.
 *
 */
export const isValidIpOrCidr = (ip: string): boolean => {
  // if the string contains a slash, treat it as a CIDR block
  if (ip.includes("/")) {
    return isValidCidr(ip);
  }

  // otherwise, treat it as a standalone IP address
  if (net.isIPv4(ip) || net.isIPv6(ip)) {
    return true;
  }

  return false;
};

export type TIp = {
  ipAddress: string;
  type: IPType;
  prefix: number;
};
/**
 * Validates the IP address [ipAddress] against the trusted IPs [trustedIps].
 */
export const checkIPAgainstBlocklist = ({ ipAddress, trustedIps }: { ipAddress: string; trustedIps: TIp[] }) => {
  const blockList = new net.BlockList();

  for (const trustedIp of trustedIps) {
    if (trustedIp.prefix !== undefined) {
      blockList.addSubnet(trustedIp.ipAddress, trustedIp.prefix, trustedIp.type);
    } else {
      blockList.addAddress(trustedIp.ipAddress, trustedIp.type);
    }
  }

  const { type } = extractIPDetails(ipAddress);
  const check = blockList.check(ipAddress, type);

  if (!check)
    throw new ForbiddenRequestError({
      message: "You are not allowed to access this resource from the current IP address"
    });
};
