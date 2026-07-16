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

// Cross-field check mirroring the backend rule: a max TTL of 0 means "no maximum",
// so the TTL is only constrained when a positive max TTL is set.
export const superRefineAccessTokenTtl = (
  data: { accessTokenTTL?: string; accessTokenMaxTTL?: string },
  ctx: z.RefinementCtx
) => {
  const ttl = Number(data.accessTokenTTL);
  const maxTtl = Number(data.accessTokenMaxTTL);

  if (!Number.isNaN(ttl) && !Number.isNaN(maxTtl) && maxTtl > 0 && ttl > maxTtl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Access Token TTL cannot be greater than Access Token Max TTL",
      path: ["accessTokenTTL"]
    });
  }
};

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
