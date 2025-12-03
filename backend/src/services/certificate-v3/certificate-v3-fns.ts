import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

export const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "d":
      return num;
    case "h":
      return Math.ceil(num / 24);
    case "m":
      return Math.ceil(num / (24 * 60));
    default:
      throw new BadRequestError({ message: `Invalid TTL unit: ${unit}` });
  }
};

export const calculateRenewalThreshold = (
  profileRenewBeforeDays: number | undefined,
  certificateTtlInDays: number
): number | undefined => {
  if (profileRenewBeforeDays === undefined) {
    return undefined;
  }

  if (profileRenewBeforeDays >= certificateTtlInDays) {
    // If renewBeforeDays >= TTL, renew 1 day before expiry
    return Math.max(1, certificateTtlInDays - 1);
  }

  return profileRenewBeforeDays;
};
