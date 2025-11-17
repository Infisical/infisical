import RE2 from "re2";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";

import { AcmeAccountDoesNotExistError } from "./pki-acme-errors";

export const buildUrl = (profileId: string, path: string): string => {
  const appCfg = getConfig();
  const baseUrl = appCfg.SITE_URL ?? "";
  return `${baseUrl}/api/v1/pki/acme/profiles/${profileId}${path}`;
};

export const extractAccountIdFromKid = (kid: string, profileId: string): string => {
  const kidPrefix = buildUrl(profileId, "/accounts/");
  if (!kid.startsWith(kidPrefix)) {
    throw new AcmeAccountDoesNotExistError({ message: "KID must start with the profile account URL" });
  }
  return z.string().uuid().parse(kid.slice(kidPrefix.length));
};

export const validateDnsIdentifier = (identifier: string): boolean => {
  // DNS label pattern: 1-63 chars, alphanumeric or hyphen, but not starting or ending with hyphen
  const labelPattern = new RE2(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/);
  const labels = identifier.split(".");
  return labels.every((label) => label.length >= 1 && label.length <= 63 && labelPattern.test(label));
};
