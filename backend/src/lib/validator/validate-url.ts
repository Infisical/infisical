import dns from "node:dns/promises";

import { isIPv4 } from "net";
import RE2 from "re2";

import { getConfig } from "@app/lib/config/env";

import { BadRequestError } from "../errors";
import { isPrivateIp } from "../ip/ipRange";

export const blockLocalAndPrivateIpAddresses = async (url: string, isGateway = false) => {
  const appCfg = getConfig();

  if (appCfg.isDevelopmentMode || isGateway) return;

  const validUrl = new URL(url);

  if (validUrl.username || validUrl.password) {
    throw new BadRequestError({ message: "URLs with user credentials (e.g., user:pass@) are not allowed" });
  }

  const inputHostIps: string[] = [];
  if (isIPv4(validUrl.hostname)) {
    inputHostIps.push(validUrl.hostname);
  } else {
    if (validUrl.hostname === "localhost" || validUrl.hostname === "host.docker.internal") {
      throw new BadRequestError({ message: "Local IPs not allowed as URL" });
    }
    const resolvedIps = await dns.resolve4(validUrl.hostname);
    inputHostIps.push(...resolvedIps);
  }
  const isInternalIp = inputHostIps.some((el) => isPrivateIp(el));
  if (isInternalIp && !appCfg.ALLOW_INTERNAL_IP_CONNECTIONS)
    throw new BadRequestError({ message: "Local IPs not allowed as URL" });
};

type FQDNOptions = {
  require_tld?: boolean;
  allow_underscores?: boolean;
  allow_trailing_dot?: boolean;
  allow_numeric_tld?: boolean;
  allow_wildcard?: boolean;
  ignore_max_length?: boolean;
};

const defaultFqdnOptions: FQDNOptions = {
  require_tld: true,
  allow_underscores: false,
  allow_trailing_dot: false,
  allow_numeric_tld: false,
  allow_wildcard: false,
  ignore_max_length: false
};

// credits: https://github.com/validatorjs/validator.js/blob/f5da7fb6ed59b94695e6fcb2e970c80029509919/src/lib/isFQDN.js#L13
export const isFQDN = (str: string, options: FQDNOptions = {}): boolean => {
  if (typeof str !== "string") {
    throw new TypeError("Expected a string");
  }

  // Apply default options
  const opts: FQDNOptions = {
    ...defaultFqdnOptions,
    ...options
  };

  let testStr = str;
  /* Remove the optional trailing dot before checking validity */
  if (opts.allow_trailing_dot && str[str.length - 1] === ".") {
    testStr = testStr.substring(0, str.length - 1);
  }

  /* Remove the optional wildcard before checking validity */
  if (opts.allow_wildcard === true && str.indexOf("*.") === 0) {
    testStr = testStr.substring(2);
  }

  const parts = testStr.split(".");
  const tld = parts[parts.length - 1];

  if (opts.require_tld) {
    // disallow fqdns without tld
    if (parts.length < 2) {
      return false;
    }

    if (
      !opts.allow_numeric_tld &&
      !new RE2(/^([a-z\u00A1-\u00A8\u00AA-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]{2,}|xn[a-z0-9-]{2,})$/i).test(tld)
    ) {
      return false;
    }

    // disallow spaces
    if (new RE2(/\s/).test(tld)) {
      return false;
    }
  }

  // reject numeric TLDs
  if (!opts.allow_numeric_tld && new RE2(/^\d+$/).test(tld)) {
    return false;
  }

  const partRegex = new RE2(/^[a-z_\u00a1-\uffff0-9-]+$/i);
  const fullWidthRegex = new RE2(/[\uff01-\uff5e]/);
  const hyphenRegex = new RE2(/^-|-$/);
  const underscoreRegex = new RE2(/_/);

  return parts.every((part) => {
    if (part.length > 63 && !opts.ignore_max_length) {
      return false;
    }

    if (!partRegex.test(part)) {
      return false;
    }

    // disallow full-width chars
    if (fullWidthRegex.test(part)) {
      return false;
    }

    // disallow parts starting or ending with hyphen
    if (hyphenRegex.test(part)) {
      return false;
    }

    if (!opts.allow_underscores && underscoreRegex.test(part)) {
      return false;
    }

    return true;
  });
};
