import { getConfig } from "@app/lib/config/env";
import { z } from "zod";
import { AcmeMalformedError } from "./pki-acme-errors";

export const buildUrl = (profileId: string, path: string): string => {
  const appCfg = getConfig();
  const baseUrl = appCfg.SITE_URL ?? "";
  return `${baseUrl}/api/v1/pki/acme/profiles/${profileId}${path}`;
};

export const extractAccountIdFromKid = (kid: string, profileId: string): string => {
  const kidPrefix = buildUrl(profileId, "/accounts/");
  if (!kid.startsWith(kidPrefix)) {
    throw new AcmeMalformedError({ detail: "KID must start with the profile account URL" });
  }
  return z.string().uuid().parse(kid.slice(kidPrefix.length));
};
