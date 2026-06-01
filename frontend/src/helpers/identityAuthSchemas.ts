import { z } from "zod";

import { IdentityTrustedIp } from "@app/hooks/api/identities/types";

import { SECONDS_PER_DAY } from "./datetime";
import { isValidIpOrCidr } from "./ip";

// Fallback used by identity auth forms when the server's configured
// `MAX_MACHINE_IDENTITY_TOKEN_AGE` is unavailable (e.g. server status hasn't
// loaded yet). 90 days, matching the backend default.
export const MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK = 7_776_000;

// Returns a z.string() with the server-enforced TTL upper-bound refine applied.
// Chain .optional() after for optional fields (e.g. accessTokenPeriod).
export const accessTokenTtlSchema = (maxTTL: number, label: string) =>
  z.string().refine((val) => !val || Number(val) <= maxTTL, {
    message: `${label} cannot exceed ${Math.floor(maxTTL / SECONDS_PER_DAY)} days`
  });

// Trusted-IP constraint fields shared by every identity auth method form
// (access token trusted IPs, plus client secret trusted IPs for Universal Auth).
export const trustedIpsSchema = z
  .object({
    ipAddress: z
      .string()
      .max(50)
      .refine(isValidIpOrCidr, "The IP is not a valid IPv4, IPv6, or CIDR block")
  })
  .array()
  .min(1);

export const DEFAULT_TRUSTED_IPS = [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }];

// Collapses the server's { ipAddress, prefix } shape back into CIDR notation for the form.
export const mapTrustedIpsFromServer = (trustedIps: IdentityTrustedIp[]) =>
  trustedIps.map(({ ipAddress, prefix }) => ({
    ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
  }));
